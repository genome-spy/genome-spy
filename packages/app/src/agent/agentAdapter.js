import { showMessageDialog } from "../components/generic/messageDialog.js";
import { showAgentChoiceDialog } from "../components/dialogs/agentChoiceDialog.js";
import templateResultToString from "../utils/templateResultToString.js";
import { getAgentContext } from "./contextBuilder.js";
import {
    submitIntentProgram,
    summarizeExecutionResult,
} from "./intentProgramExecutor.js";
import { validateIntentProgram } from "./intentProgramValidator.js";
import { summarizeIntentProgram } from "./actionCatalog.js";
import { parseClarificationMessage } from "./clarificationMessage.js";
import { viewSettingsSlice } from "../viewSettingsSlice.js";
import { makeViewSelectorKey } from "../viewSettingsUtils.js";
import { resolveViewSelector } from "@genome-spy/core/view/viewSelectors.js";
import {
    MAX_REJECTED_TOOL_CALL_RETRIES,
    MAX_REPEATED_REJECTED_TOOL_CALL_REPEATS,
    serializeToolCallSignature,
} from "./toolCallLoop.js";

const DEFAULT_AGENT_BASE_URL = "http://127.0.0.1:8000";
const SHOULD_LOG_AGENT_TRACE =
    import.meta.env.DEV && import.meta.env.MODE !== "test";
const SHOULD_LOG_AGENT_IO =
    import.meta.env.DEV && import.meta.env.MODE !== "test";

function now() {
    return globalThis.performance?.now?.() ?? Date.now();
}

/**
 * @param {number} startedAt
 * @returns {number}
 */
function elapsedMilliseconds(startedAt) {
    return Math.round((now() - startedAt) * 10) / 10;
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function looksLikeStructuredToolMessage(text) {
    const stripped = text.trimStart();
    return (
        stripped.startsWith("{") ||
        stripped.startsWith("[") ||
        stripped.startsWith("```") ||
        /^"[^"]+"\s*:/.test(stripped)
    );
}

/**
 * @typedef {import("./types.d.ts").AgentConversationMessage} AgentConversationMessage
 * @typedef {import("./types.d.ts").AgentContextOptions} AgentContextOptions
 * @typedef {import("./types.d.ts").AgentToolCall} AgentToolCall
 */

/**
 * @param {Array<string | AgentConversationMessage>} history
 * @returns {AgentConversationMessage[]}
 */
function normalizeConversationHistory(history) {
    return history.map((entry, index) => {
        if (typeof entry === "string") {
            return {
                id: "history-" + (index + 1),
                role: index % 2 === 0 ? "user" : "assistant",
                text: entry,
            };
        }

        return {
            id: String(entry.id),
            role: entry.role,
            text: entry.text,
            ...(entry.kind ? { kind: entry.kind } : {}),
            ...(entry.toolCalls ? { toolCalls: entry.toolCalls } : {}),
            ...(entry.toolCallId ? { toolCallId: entry.toolCallId } : {}),
            ...(entry.content !== undefined ? { content: entry.content } : {}),
        };
    });
}

/**
 * @param {Record<string, any>} trace
 */
function publishAgentTrace(trace) {
    trace.timestamp = new Date().toISOString();

    if (typeof window === "undefined") {
        return;
    }

    const app = /** @type {any} */ (window).__genomeSpyApp;
    app?.recordAgentTrace?.(trace);
    /** @type {any} */ (window).__genomeSpyLastAgentTrace = trace;
    if (SHOULD_LOG_AGENT_TRACE) {
        console.groupCollapsed(
            "[GenomeSpy Agent] " + trace.message + " (" + trace.totalMs + " ms)"
        );
        console.table(trace);
        console.groupEnd();
    }
}

/**
 * @param {string} phase
 * @param {Record<string, any>} payload
 */
function logAgentTransport(phase, payload) {
    if (!SHOULD_LOG_AGENT_IO) {
        return;
    }

    console.log("[GenomeSpy Agent] " + phase, payload);
}

/**
 * @param {import("../app.js").default} app
 */
export function createAgentAdapter(app) {
    return {
        getAgentContext: (
            /** @type {AgentContextOptions} */ contextOptions = getCurrentAgentContextOptions(
                app
            )
        ) => getAgentContext(app, contextOptions),
        validateIntentProgram: (/** @type {unknown} */ program) =>
            validateIntentProgram(app, program),
        submitIntentProgram: (
            /** @type {import("./types.js").IntentProgram} */ program
        ) => submitIntentProgram(app, program),
        resolveViewSelector: (
            /** @type {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} */ selector
        ) => {
            const viewRoot = app.genomeSpy?.viewRoot;
            if (!viewRoot) {
                return undefined;
            }

            return resolveViewSelector(viewRoot, selector);
        },
        setViewVisibility: (
            /** @type {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} */ selector,
            /** @type {boolean} */ visibility
        ) => setViewVisibility(app, selector, visibility),
        clearViewVisibility: (
            /** @type {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} */ selector
        ) => clearViewVisibility(app, selector),
        summarizeExecutionResult,
        summarizeIntentProgram: (
            /** @type {import("./types.js").IntentProgram} */ program
        ) => summarizeIntentProgram(app, program),
        requestPlan: (
            /** @type {string} */ message,
            /** @type {Array<string | AgentConversationMessage>} */ history = [],
            /** @type {import("./agentSessionController.js").AgentStreamCallbacks} */ streamCallbacks = {},
            /** @type {boolean} */ allowStreaming = true,
            /** @type {AgentContextOptions} */ contextOptions = {}
        ) =>
            requestPlan(app, {
                message,
                history,
                streamCallbacks,
                allowStreaming,
                contextOptions,
            }),
        runLocalPrompt: () => runLocalPrompt(app),
    };
}

/**
 * @param {import("../app.js").default} app
 * @param {{
 *   message: string,
 *   history?: Array<string | AgentConversationMessage>,
 *   streamCallbacks?: import("./agentSessionController.js").AgentStreamCallbacks,
 *   allowStreaming?: boolean,
 *   contextOptions?: AgentContextOptions,
 *   signal?: AbortSignal
 * }} options
 * @returns {Promise<{ response: import("./types.js").PlanResponse, trace: Record<string, any> }>}
 */
async function requestPlan(app, options) {
    const baseUrl = app.options.agentBaseUrl ?? DEFAULT_AGENT_BASE_URL;
    const startedAt = now();
    const contextStartedAt = now();
    const context = getAgentContext(app, options.contextOptions);
    const contextBuildMs = elapsedMilliseconds(contextStartedAt);
    const history = normalizeConversationHistory(options.history ?? []);
    const shouldStream =
        options.allowStreaming !== false &&
        shouldUseStreaming(options.streamCallbacks);
    if (options.signal?.aborted) {
        throw createAbortError();
    }
    const requestPayload = {
        message: options.message,
        history,
        context,
    };

    logAgentTransport("request", {
        baseUrl,
        payload: requestPayload,
    });

    if (baseUrl === "mock") {
        if (!import.meta.env.DEV) {
            throw new Error(
                "Mock agent backend is available only in dev mode."
            );
        }

        const mockStartedAt = now();
        const { requestMockPlan } = await import("./mockPlanner.js");
        const requestResult = await requestMockPlan({
            message: options.message,
            history,
            context,
        });
        logAgentTransport("response", {
            baseUrl,
            payload: requestResult.response,
        });

        return {
            response: requestResult.response,
            trace: {
                message: options.message,
                contextBuildMs,
                requestMs: elapsedMilliseconds(mockStartedAt),
                responseParseMs: 0,
                serverTiming: "mock",
                agentServerTotalMs: "mock",
                totalMs: elapsedMilliseconds(startedAt),
            },
        };
    }

    const requestStartedAt = now();
    const response = await fetch(baseUrl + "/v1/plan", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...(shouldStream ? { accept: "text/event-stream" } : {}),
        },
        body: JSON.stringify(requestPayload),
        signal: options.signal,
    });
    const requestMs = elapsedMilliseconds(requestStartedAt);

    if (!response.ok) {
        throw new Error(
            "Local agent request failed with status " + response.status + "."
        );
    }

    if (
        shouldStream &&
        response.headers.get("content-type")?.includes("text/event-stream")
    ) {
        const parseStartedAt = now();
        const streamedResponse = await consumePlannerStream(
            response,
            options.streamCallbacks ?? {}
        );
        const responseParseMs = elapsedMilliseconds(parseStartedAt);
        logAgentTransport("response", {
            baseUrl,
            payload: streamedResponse.response,
        });

        return {
            response: streamedResponse.response,
            trace: {
                message: options.message,
                contextBuildMs,
                requestMs,
                responseParseMs,
                serverTiming: response.headers.get("server-timing") ?? "n/a",
                agentServerTotalMs:
                    response.headers.get("x-genomespy-agent-total-ms") ?? "n/a",
                totalMs: elapsedMilliseconds(startedAt),
            },
        };
    } else {
        const parseStartedAt = now();
        const parsedResponse = await response.json();
        const responseParseMs = elapsedMilliseconds(parseStartedAt);
        logAgentTransport("response", {
            baseUrl,
            payload: parsedResponse,
        });

        return {
            response: parsedResponse,
            trace: {
                message: options.message,
                contextBuildMs,
                requestMs,
                responseParseMs,
                serverTiming: response.headers.get("server-timing") ?? "n/a",
                agentServerTotalMs:
                    response.headers.get("x-genomespy-agent-total-ms") ?? "n/a",
                totalMs: elapsedMilliseconds(startedAt),
            },
        };
    }
}

/**
 * @returns {Error}
 */
function createAbortError() {
    const error = new Error("Aborted");
    error.name = "AbortError";
    return error;
}

/**
 * @param {import("../app.js").default} app
 * @param {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} selector
 * @param {boolean} visibility
 */
function setViewVisibility(app, selector, visibility) {
    app.store.dispatch(
        viewSettingsSlice.actions.setVisibility({
            key: makeViewSelectorKey(selector),
            visibility,
        })
    );
}

/**
 * @param {import("../app.js").default} app
 * @param {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} selector
 */
function clearViewVisibility(app, selector) {
    const key = makeViewSelectorKey(selector);
    app.store.dispatch(viewSettingsSlice.actions.restoreDefaultVisibility(key));

    const viewRoot = app.genomeSpy?.viewRoot;
    if (!viewRoot) {
        return;
    }

    const view = resolveViewSelector(viewRoot, selector);
    if (view?.explicitName && view.explicitName !== key) {
        app.store.dispatch(
            viewSettingsSlice.actions.restoreDefaultVisibility(
                view.explicitName
            )
        );
    }
}

/**
 * @param {import("./agentSessionController.js").AgentStreamCallbacks | undefined} streamCallbacks
 * @returns {boolean}
 */
function shouldUseStreaming(streamCallbacks) {
    return Boolean(
        streamCallbacks &&
        (streamCallbacks.onDelta ||
            streamCallbacks.onReasoning ||
            streamCallbacks.onHeartbeat)
    );
}

/**
 * @param {Response} response
 * @param {import("./agentSessionController.js").AgentStreamCallbacks} streamCallbacks
 * @returns {Promise<{ response: import("./types.js").PlanResponse }>}
 */
async function consumePlannerStream(response, streamCallbacks) {
    if (!response.body) {
        throw new Error("Streaming response did not include a body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventName = "message";
    let dataLines = [];
    let finalResponse = null;

    while (true) {
        const { value, done } = await reader.read();
        if (done) {
            break;
        }

        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
            const rawLine = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            const line = rawLine.endsWith("\r")
                ? rawLine.slice(0, -1)
                : rawLine;

            if (line === "") {
                const eventData = dataLines.join("\n");
                if (eventData.length > 0) {
                    if (eventData !== "[DONE]") {
                        finalResponse = handlePlannerStreamEvent(
                            eventName,
                            eventData,
                            streamCallbacks,
                            finalResponse
                        );
                    }
                }
                eventName = "message";
                dataLines = [];
            } else if (line.startsWith("event:")) {
                eventName = line.slice("event:".length).trim();
            } else if (line.startsWith("data:")) {
                dataLines.push(line.slice("data:".length).trimStart());
            }

            newlineIndex = buffer.indexOf("\n");
        }
    }

    const trailingLine = buffer.trim();
    if (trailingLine.length > 0) {
        finalResponse = handlePlannerStreamEvent(
            eventName,
            trailingLine,
            streamCallbacks,
            finalResponse
        );
    }

    if (!finalResponse) {
        throw new Error(
            "Streaming response ended without a final planner event."
        );
    }

    return {
        response: finalResponse,
    };
}

/**
 * @param {string} eventName
 * @param {string} eventData
 * @param {import("./agentSessionController.js").AgentStreamCallbacks} streamCallbacks
 * @param {import("./types.js").PlanResponse | null} finalResponse
 * @returns {import("./types.js").PlanResponse | null}
 */
function handlePlannerStreamEvent(
    eventName,
    eventData,
    streamCallbacks,
    finalResponse
) {
    /** @type {Record<string, any>} */
    let payload;
    try {
        payload = JSON.parse(eventData);
    } catch {
        payload = { data: eventData };
    }

    if (eventName === "delta" && typeof payload.delta === "string") {
        streamCallbacks.onDelta?.(payload.delta);
        return finalResponse;
    }

    if (eventName === "reasoning_delta" && typeof payload.delta === "string") {
        streamCallbacks.onReasoning?.(payload.delta);
        return finalResponse;
    }

    if (eventName === "heartbeat") {
        streamCallbacks.onHeartbeat?.();
        return finalResponse;
    }

    if (eventName === "final" && payload.response) {
        return /** @type {import("./types.js").PlanResponse} */ ({
            type: payload.response.type,
            message: payload.response.message,
            ...(payload.response.toolCalls
                ? { toolCalls: payload.response.toolCalls }
                : {}),
        });
    }

    if (eventName === "error") {
        throw new Error(payload.message ?? "Streaming planner request failed.");
    }

    return finalResponse;
}

/**
 * @param {import("../app.js").default} app
 * @returns {import("./types.d.ts").AgentContextOptions}
 */
function getCurrentAgentContextOptions(app) {
    return {
        expandedViewNodeKeys:
            app.agentSessionController?.getSnapshot().expandedViewNodeKeys ??
            [],
    };
}

/**
 * @param {import("../app.js").default} app
 * @returns {Promise<void>}
 */
async function runLocalPrompt(app) {
    const initialMessage = window.prompt("Local agent prompt");
    if (!initialMessage) {
        return;
    }

    const startedAt = now();
    /** @type {Record<string, any>} */
    const trace = { message: initialMessage };
    /** @type {Array<string | AgentConversationMessage>} */
    const history = [];
    let message = initialMessage;
    let toolRounds = 0;
    let rejectedToolCallRounds = 0;
    let lastRejectedToolCallSignature = "";
    let repeatedRejectedToolCallRounds = 0;

    try {
        while (true) {
            const requestResult = await requestPlan(app, {
                message,
                history,
                contextOptions: getCurrentAgentContextOptions(app),
            });
            const response = requestResult.response;
            Object.assign(trace, requestResult.trace);

            if (response.type === "clarify") {
                const parsedClarification = parseClarificationMessage(
                    response.message
                );
                if (parsedClarification.options.length === 0) {
                    trace.responseType = response.type;
                    trace.totalMs = elapsedMilliseconds(startedAt);
                    publishAgentTrace(trace);
                    await showMessageDialog(response.message, {
                        title: "Agent Clarification",
                        type: "info",
                    });
                    return;
                }

                const followUpValue = await showAgentChoiceDialog({
                    title: "Agent Clarification",
                    message:
                        typeof parsedClarification.text === "string"
                            ? parsedClarification.text
                            : templateResultToString(parsedClarification.text),
                    choiceLabel: "Clarification",
                    options: parsedClarification.options,
                    value: parsedClarification.options[0].value,
                });
                if (!followUpValue) {
                    throw new Error("Agent clarification was cancelled.");
                }

                history.push(message, response.message);
                message = followUpValue.trim();
                continue;
            }

            if (response.type === "answer") {
                trace.responseType = response.type;
                trace.totalMs = elapsedMilliseconds(startedAt);
                publishAgentTrace(trace);
                await showMessageDialog(response.message, {
                    title: "Agent Response",
                    type: "info",
                });
                return;
            }

            if (response.type === "agent_program") {
                await runAgentProgram(
                    app,
                    response.program.steps,
                    trace,
                    startedAt
                );
                return;
            }

            if (response.type === "tool_call") {
                toolRounds += 1;
                if (toolRounds > 5) {
                    throw new Error(
                        "Agent tool calls did not converge after 5 rounds."
                    );
                }

                /** @type {AgentConversationMessage} */
                history.push({
                    id: `tool-call-${toolRounds}`,
                    role: "assistant",
                    text:
                        response.message &&
                        !looksLikeStructuredToolMessage(response.message)
                            ? response.message
                            : "",
                    kind: "tool_call",
                    toolCalls: response.toolCalls,
                });

                const controller = app.agentSessionController;
                if (!controller?.executeToolCalls) {
                    throw new Error(
                        "Agent tool calls require an attached session controller."
                    );
                }

                const executionResults = await controller.executeToolCalls(
                    response.toolCalls
                );
                for (const toolCall of response.toolCalls) {
                    const executionResult = executionResults.find(
                        (result) => result.toolCallId === toolCall.callId
                    );
                    if (!executionResult || !executionResult.text) {
                        continue;
                    }

                    history.push({
                        id: `tool-result-${toolRounds}-${toolCall.callId}`,
                        role: "tool",
                        text: executionResult.text,
                        toolCallId: toolCall.callId,
                        kind: "tool_result",
                    });
                }

                const controllerSnapshot = controller.getSnapshot();
                if (controllerSnapshot.status === "error") {
                    throw new Error(
                        controllerSnapshot.lastError ||
                            "Agent tool call failed."
                    );
                }

                if (executionResults.some((result) => result.rejected)) {
                    const rejectedToolCallSignature =
                        serializeToolCallSignature(response.toolCalls);
                    rejectedToolCallRounds += 1;
                    if (
                        rejectedToolCallSignature ===
                        lastRejectedToolCallSignature
                    ) {
                        repeatedRejectedToolCallRounds += 1;
                    } else {
                        lastRejectedToolCallSignature =
                            rejectedToolCallSignature;
                        repeatedRejectedToolCallRounds = 0;
                    }

                    if (
                        repeatedRejectedToolCallRounds >=
                        MAX_REPEATED_REJECTED_TOOL_CALL_REPEATS
                    ) {
                        throw new Error(
                            "Agent repeated the same rejected tool call after validation failure."
                        );
                    }

                    if (
                        rejectedToolCallRounds > MAX_REJECTED_TOOL_CALL_RETRIES
                    ) {
                        throw new Error(
                            "Agent produced too many rejected tool calls without converging."
                        );
                    }
                }
                continue;
            }

            if (response.type !== "intent_program") {
                throw new Error(
                    "Unsupported agent response type: " + response.type
                );
            }

            const validationStartedAt = now();
            const validation = validateIntentProgram(app, response.program);
            trace.validationMs = elapsedMilliseconds(validationStartedAt);
            if (!validation.ok) {
                throw new Error(validation.errors.join("\n"));
            }

            await runAgentProgram(
                app,
                [
                    {
                        type: "intent_program",
                        program: validation.program,
                    },
                ],
                trace,
                startedAt
            );
            return;
        }
    } catch (error) {
        trace.error = String(error);
        trace.totalMs = elapsedMilliseconds(startedAt);
        publishAgentTrace(trace);
        await showMessageDialog(String(error), {
            title: "Local Agent Error",
            type: "error",
        });
    }
}

/**
 * @param {import("../app.js").default} app
 * @param {import("./types.js").AgentProgramStep[]} steps
 * @param {Record<string, any>} trace
 * @param {number} startedAt
 */
async function runAgentProgram(app, steps, trace, startedAt) {
    const previewStartedAt = now();
    /** @type {Array<{ type: "intent_program", summary: string, program: import("./types.js").IntentProgram }>} */
    const preparedSteps = [];
    for (const step of steps) {
        preparedSteps.push(await prepareAgentProgramStep(app, step));
    }
    trace.previewBuildMs = elapsedMilliseconds(previewStartedAt);

    const confirmationStartedAt = now();
    const confirmed = await showMessageDialog(
        preparedSteps.map((step) => step.summary).join("\n"),
        {
            title: "Execute Local Agent Plan?",
            type: "info",
            confirm: true,
        }
    );
    trace.confirmationMs = elapsedMilliseconds(confirmationStartedAt);
    if (!confirmed) {
        trace.executed = false;
        trace.totalMs = elapsedMilliseconds(startedAt);
        publishAgentTrace(trace);
        return;
    }

    const executionStartedAt = now();
    let executedActions = 0;
    /** @type {Array<{ executedActions: number, intentProgramResult?: import("./types.js").IntentProgramExecutionResult }>} */
    const executionResults = [];
    for (const step of preparedSteps) {
        const result = await executePreparedAgentProgramStep(app, step);
        executedActions += result.executedActions;
        executionResults.push(result);
    }
    trace.executionMs = elapsedMilliseconds(executionStartedAt);
    trace.executedActions = executedActions;
    trace.executed = true;
    trace.responseType =
        preparedSteps.length > 1 ? "agent_program" : preparedSteps[0].type;
    trace.totalMs = elapsedMilliseconds(startedAt);
    publishAgentTrace(trace);

    if (preparedSteps.length === 1) {
        const [preparedStep] = preparedSteps;
        const [executionResult] = executionResults;

        if (preparedStep.type === "intent_program") {
            await showMessageDialog(
                summarizeExecutionResult(executionResult.intentProgramResult),
                {
                    title: "Local Agent Execution",
                    type: "info",
                }
            );
        } else {
            await showMessageDialog(
                "Executed 1 action.\n- " + preparedStep.summary,
                {
                    title: "Local Agent Execution",
                    type: "info",
                }
            );
        }
    } else {
        await showMessageDialog(
            "Executed " +
                preparedSteps.length +
                " step" +
                (preparedSteps.length === 1 ? "" : "s") +
                ".",
            {
                title: "Local Agent Execution",
                type: "info",
            }
        );
    }
}

/**
 * @param {import("../app.js").default} app
 * @param {import("./types.js").AgentProgramStep} step
 * @returns {Promise<
 *   | {
 *         type: "intent_program";
 *         summary: string;
 *         program: import("./types.js").IntentProgram;
 *     }
 * >}
 */
async function prepareAgentProgramStep(app, step) {
    if (step.type === "intent_program") {
        const validation = validateIntentProgram(app, step.program);
        if (!validation.ok) {
            throw new Error(validation.errors.join("\n"));
        }

        const summaries = summarizeIntentProgram(app, validation.program);
        return {
            type: "intent_program",
            summary: summaries.map((line) => "- " + line.text).join("\n"),
            program: validation.program,
        };
    }

    throw new Error("Unsupported agent program step.");
}

/**
 * @param {import("../app.js").default} app
 * @param {{
 *   type: "intent_program",
 *   summary: string,
 *   program: import("./types.js").IntentProgram
 * }} step
 */
async function executePreparedAgentProgramStep(app, step) {
    if (step.type === "intent_program") {
        const intentProgramResult = await submitIntentProgram(
            app,
            step.program
        );
        return {
            executedActions: intentProgramResult.executedActions,
            intentProgramResult,
        };
    }
}
