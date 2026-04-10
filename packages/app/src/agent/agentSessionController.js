import templateResultToString from "../utils/templateResultToString.js";
import { makeViewSelectorKey } from "../viewSettingsUtils.js";
import {
    formatToolCallRejection,
    validateToolArgumentsShape,
} from "./toolCatalog.js";
import { resolveSelectionAggregationCandidate } from "./selectionAggregationTool.js";
import {
    MAX_REJECTED_TOOL_CALL_RETRIES,
    MAX_REPEATED_REJECTED_TOOL_CALL_REPEATS,
    serializeToolCallSignature,
} from "./toolCallLoop.js";
import { parseClarificationMessage } from "./clarificationMessage.js";
import { looksLikeStructuredToolMessage } from "./messageDetection.js";

/** @typedef {import("./types.d.ts").AgentConversationMessage} AgentConversationMessage */
/** @typedef {import("./types.d.ts").IntentProgram} IntentProgram */
/** @typedef {import("./types.d.ts").IntentProgramExecutionResult} IntentProgramExecutionResult */
/** @typedef {import("./types.d.ts").IntentProgramSummaryLine} IntentProgramSummaryLine */
/** @typedef {import("./types.d.ts").IntentProgramValidationResult} IntentProgramValidationResult */
/** @typedef {import("./types.d.ts").AgentContextOptions} AgentContextOptions */
/** @typedef {import("./types.d.ts").AgentContext} AgentContext */
/** @typedef {import("./types.d.ts").AgentToolCall} AgentToolCall */
/** @typedef {import("./types.d.ts").AgentViewStateChange} AgentViewStateChange */
/** @typedef {import("./types.d.ts").PlanResponse | {
 *     type: "clarify";
 *     message: string | import("lit").TemplateResult;
 *     options?: ChatClarificationOption[];
 * } | {
 *     type: "tool_call";
 *     toolCalls: AgentToolCall[];
 *     message?: string;
 * }} ChatPlannerResponse */
/**
 * @typedef {{
 *     onDelta?: (delta: string) => void;
 *     onReasoning?: (delta: string) => void;
 *     onHeartbeat?: () => void;
 * }} AgentStreamCallbacks
 *
 * @typedef {{
 *     turnId: number;
 *     status: "working" | "streaming" | "final" | "error";
 *     placeholder: string;
 *     draftText: string;
 *     reasoningText: string;
 *     heartbeatTick: number;
 * }} AgentActiveTurnSnapshot
 */

/**
 * @typedef {{
 *     value: string;
 *     label: string;
 *     description?: string;
 * }} ChatClarificationOption
 *
 * @typedef {{
 *     toolCallId: string;
 *     text: string | null;
 *     rejected: boolean;
 *     content?: unknown;
 * }} ToolExecutionResult
 *
 * @typedef {{
 *     id: number;
 *     kind:
 *         | "user"
 *         | "assistant"
 *         | "clarification"
 *         | "plan"
 *         | "result"
 *         | "tool_call"
 *         | "tool_result"
 *         | "error";
 *     text?: string | import("lit").TemplateResult;
 *     lines?: IntentProgramSummaryLine[];
 *     options?: ChatClarificationOption[];
 *     toolCalls?: AgentToolCall[];
 *     toolCallId?: string;
 *     content?: unknown;
 *     durationMs?: number | null;
 * }} AgentChatMessage
 *
 * @typedef {{
 *     status: "ready" | "preflighting" | "thinking" | "clarification" | "executing" | "unavailable" | "error";
 *     preflightState: "idle" | "running" | "ready" | "failed";
 *     messages: AgentChatMessage[];
 *     pendingRequest: { message: string } | null;
 *     pendingResponsePlaceholder: string;
 *     queuedMessageCount: number;
 *     lastError: string;
 *     lastResponseDurationMs: number | null;
 *     expandedViewNodeKeys: string[];
 * }} AgentSessionSnapshot
 *
 * @typedef {{
 *     requestPlan(
 *         message: string,
 *         history?: AgentConversationMessage[],
 *         stream?: AgentStreamCallbacks,
 *         allowStreaming?: boolean,
 *         contextOptions?: AgentContextOptions,
 *         signal?: AbortSignal
 *     ): Promise<{ response: ChatPlannerResponse; trace: Record<string, any> }>;
 *     validateIntentProgram(program: unknown): IntentProgramValidationResult;
 *     submitIntentProgram(program: IntentProgram): Promise<IntentProgramExecutionResult>;
 *     getAgentContext(contextOptions?: AgentContextOptions): AgentContext;
 *     resolveViewSelector(selector: import("@genome-spy/core/view/viewSelectors.js").ViewSelector): import("@genome-spy/core/view/view.js").default | undefined;
 *     setViewVisibility(selector: import("@genome-spy/core/view/viewSelectors.js").ViewSelector, visibility: boolean): void;
 *     clearViewVisibility(selector: import("@genome-spy/core/view/viewSelectors.js").ViewSelector): void;
 *     summarizeExecutionResult(result: IntentProgramExecutionResult): string;
 *     summarizeIntentProgram(program: IntentProgram): IntentProgramSummaryLine[];
 * }} AgentSessionRuntime
 */

const PREFLIGHT_MESSAGE = 'Preflight check: answer with just "I\'m here".';
/**
 * @returns {number}
 */
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
 * @param {AgentSessionRuntime} runtime
 * @returns {AgentSessionController}
 */
export function createAgentSessionController(runtime) {
    return new AgentSessionController(runtime);
}

/**
 * State controller for the agent chat session.
 */
export class AgentSessionController {
    /**
     * @param {AgentSessionRuntime} runtime
     */
    constructor(runtime) {
        this.#runtime = runtime;

        /** @type {Set<(snapshot: AgentSessionSnapshot) => void>} */
        this.#listeners = new Set();
        /** @type {Set<(snapshot: AgentActiveTurnSnapshot | null) => void>} */
        this.#activeTurnListeners = new Set();
        /**
         * Keep the session state explicit so the panel can render a read-only
         * snapshot and future session commands can be added without changing
         * the UI contract.
         * @type {AgentSessionSnapshot}
         */
        this.#state = {
            status: "ready",
            preflightState: "idle",
            messages: [],
            pendingRequest: null,
            pendingResponsePlaceholder: "",
            queuedMessageCount: 0,
            lastError: "",
            lastResponseDurationMs: null,
            expandedViewNodeKeys: [],
        };

        /** @type {Promise<void> | null} */
        this.#preflightPromise = null;
        /** @type {boolean} */
        this.#drainingQueue = false;
        /** @type {number} */
        this.#nextMessageId = 1;
        /** @type {number} */
        this.#nextTurnId = 1;
        /** @type {string[]} */
        this.#queuedMessages = [];
        /** @type {AgentActiveTurnSnapshot | null} */
        this.#activeTurn = null;
        /** @type {Set<string>} */
        this.#expandedViewNodeKeys = new Set();
        /** @type {AbortController | null} */
        this.#activeRequestAbortController = null;
        /** @type {Set<number>} */
        this.#cancelledTurnIds = new Set();
    }

    /** @type {AgentSessionRuntime} */
    #runtime;

    /** @type {Set<(snapshot: AgentSessionSnapshot) => void>} */
    #listeners;

    /** @type {Set<(snapshot: AgentActiveTurnSnapshot | null) => void>} */
    #activeTurnListeners;

    /** @type {AgentSessionSnapshot} */
    #state;

    /** @type {Promise<void> | null} */
    #preflightPromise;

    /** @type {boolean} */
    #drainingQueue;

    /** @type {number} */
    #nextMessageId;

    /** @type {number} */
    #nextTurnId;

    /** @type {string[]} */
    #queuedMessages;

    /** @type {AgentActiveTurnSnapshot | null} */
    #activeTurn;

    /** @type {Set<string>} */
    #expandedViewNodeKeys;

    /** @type {AbortController | null} */
    #activeRequestAbortController;

    /** @type {Set<number>} */
    #cancelledTurnIds;

    /**
     * @param {(snapshot: AgentSessionSnapshot) => void} listener
     * @returns {() => void}
     */
    subscribe(listener) {
        this.#listeners.add(listener);
        listener(this.getSnapshot());
        return () => {
            this.#listeners.delete(listener);
        };
    }

    /**
     * @param {(snapshot: AgentActiveTurnSnapshot | null) => void} listener
     * @returns {() => void}
     */
    subscribeToActiveTurn(listener) {
        this.#activeTurnListeners.add(listener);
        listener(this.#cloneActiveTurn());
        return () => {
            this.#activeTurnListeners.delete(listener);
        };
    }

    /**
     * @returns {AgentSessionSnapshot}
     */
    getSnapshot() {
        return {
            ...this.#state,
            expandedViewNodeKeys: Array.from(this.#expandedViewNodeKeys),
            messages: this.#state.messages.map((message) => ({
                ...message,
                lines: message.lines?.slice(),
                options: message.options?.map((option) => ({
                    ...option,
                })),
                toolCalls: message.toolCalls?.map((toolCall) => ({
                    ...toolCall,
                })),
            })),
        };
    }

    /**
     * Opens the session and starts the preflight check.
     *
     * @returns {Promise<void>}
     */
    async open() {
        await this.#ensurePreflight();
    }

    /**
     * Closes the session view. The controller keeps the transcript state so
     * the panel can be reattached without losing context.
     */
    close() {}

    /**
     * Forces the preflight to run again.
     *
     * @returns {Promise<void>}
     */
    async refreshPreflight() {
        this.#preflightPromise = null;
        this.#state.preflightState = "idle";
        this.#state.status = "ready";
        this.#notify();
        await this.#ensurePreflight(true);
    }

    /**
     * @param {string} message
     * @returns {Promise<void>}
     */
    async sendMessage(message) {
        const trimmed = message.trim();
        if (!trimmed) {
            return;
        }

        if (this.#shouldQueue()) {
            await this.queueMessage(trimmed);
            void this.#ensurePreflight();
            return;
        }

        await this.#processMessage(trimmed);
    }

    /**
     * @param {string} message
     * @returns {Promise<void>}
     */
    async queueMessage(message) {
        const trimmed = message.trim();
        if (!trimmed) {
            return;
        }

        this.#queuedMessages.push(trimmed);
        this.#state.queuedMessageCount = this.#queuedMessages.length;
        this.#notify();
        void this.#drainQueue();
    }

    /**
     * Expands a collapsed view branch for the current session context.
     *
     * @param {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} selector
     */
    expandViewNode(selector) {
        const key = makeViewSelectorKey(selector);
        if (this.#expandedViewNodeKeys.has(key)) {
            return;
        }

        this.#expandedViewNodeKeys.add(key);
        this.#state.expandedViewNodeKeys = Array.from(
            this.#expandedViewNodeKeys
        );
        this.#notify();
    }

    /**
     * Collapses a previously expanded view branch in the current session
     * context.
     *
     * @param {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} selector
     */
    collapseViewNode(selector) {
        const key = makeViewSelectorKey(selector);
        if (!this.#expandedViewNodeKeys.has(key)) {
            return;
        }

        this.#expandedViewNodeKeys.delete(key);
        this.#state.expandedViewNodeKeys = Array.from(
            this.#expandedViewNodeKeys
        );
        this.#notify();
    }

    /**
     * Cancels the current active turn and clears queued work.
     */
    stopCurrentTurn() {
        if (!this.#activeTurn && !this.#state.pendingRequest) {
            this.#queuedMessages = [];
            this.#state.queuedMessageCount = 0;
            this.#state.pendingResponsePlaceholder = "";
            this.#notify();
            return;
        }

        const turnId = this.#activeTurn?.turnId;
        if (turnId !== undefined) {
            this.#cancelledTurnIds.add(turnId);
        }

        this.#activeRequestAbortController?.abort();
        this.#activeRequestAbortController = null;
        this.#queuedMessages = [];
        this.#state.queuedMessageCount = 0;
        this.#state.pendingRequest = null;
        this.#state.pendingResponsePlaceholder = "";
        this.#state.status = "ready";
        this.#state.lastError = "";
        this.#resetActiveTurnDraft(turnId ?? -1);
        this.#clearActiveTurn(turnId ?? -1);
        this.#notify();
        void this.#drainQueue();
    }

    /**
     * Executes tool calls requested by the planner.
     *
     * @param {AgentToolCall[]} toolCalls
     * @returns {Promise<ToolExecutionResult[]>}
     */
    async executeToolCalls(toolCalls) {
        /** @type {ToolExecutionResult[]} */
        const results = [];
        for (const toolCall of toolCalls) {
            const result = await this.#executeToolCall(toolCall);
            results.push({
                toolCallId: toolCall.callId,
                text: result.text,
                rejected: result.rejected,
                ...(result.content !== undefined
                    ? { content: result.content }
                    : {}),
            });
            if (result.text || result.content !== undefined) {
                this.#appendMessage({
                    kind: "tool_result",
                    text: result.text ?? "",
                    toolCallId: toolCall.callId,
                    ...(result.content !== undefined
                        ? { content: result.content }
                        : {}),
                    durationMs: null,
                });
                this.#notify();
            }
        }

        return results;
    }

    /**
     * @returns {boolean}
     */
    #shouldQueue() {
        return (
            this.#state.preflightState !== "ready" ||
            this.#state.pendingRequest !== null
        );
    }

    /**
     * @param {boolean} [force=false]
     * @returns {Promise<void>}
     */
    async #ensurePreflight(force = false) {
        if (this.#preflightPromise) {
            return this.#preflightPromise;
        }

        if (!force && this.#state.preflightState === "ready") {
            return;
        }

        this.#state.preflightState = "running";
        this.#state.status = "preflighting";
        this.#state.lastError = "";
        this.#notify();

        const preflightPromise = this.#runPreflight();
        this.#preflightPromise = preflightPromise;

        try {
            await preflightPromise;
        } finally {
            if (this.#preflightPromise === preflightPromise) {
                this.#preflightPromise = null;
            }
        }
    }

    /**
     * Runs a harmless planner request to prime the server prompt cache and
     * verify the transport path before the first real user turn.
     *
     * @returns {Promise<void>}
     */
    async #runPreflight() {
        try {
            const { response } = await this.#runtime.requestPlan(
                PREFLIGHT_MESSAGE,
                [],
                undefined,
                false,
                this.#buildContextOptions()
            );

            if (!this.#looksDecent(response)) {
                throw new Error(
                    "Agent preflight returned an invalid response."
                );
            }

            this.#state.preflightState = "ready";
            this.#state.status = "ready";
            this.#notify();
            await this.#drainQueue();
        } catch {
            this.#state.preflightState = "failed";
            this.#state.status = "unavailable";
            this.#state.pendingRequest = null;
            this.#state.pendingResponsePlaceholder = "";
            this.#state.lastError =
                "It seems that the agent is currently unavailable.";
            this.#notify();
        }
    }

    /**
     * @param {ChatPlannerResponse} response
     * @returns {boolean}
     */
    #looksDecent(response) {
        return (
            typeof response === "object" &&
            response !== null &&
            "type" in response &&
            (response.type === "answer" ||
                response.type === "clarify" ||
                response.type === "tool_call" ||
                response.type === "intent_program" ||
                response.type === "agent_program")
        );
    }

    /**
     * @param {string} message
     * @returns {Promise<void>}
     */
    async #processMessage(message) {
        if (this.#state.pendingRequest) {
            await this.queueMessage(message);
            return;
        }

        this.#appendMessage({
            kind: "user",
            text: message,
        });

        this.#state.pendingRequest = { message };
        this.#state.pendingResponsePlaceholder = "Working...";
        this.#state.status = "thinking";
        this.#state.lastError = "";
        this.#state.lastResponseDurationMs = null;
        this.#notify();

        const turnId = this.#beginActiveTurn();
        this.#activeRequestAbortController = new AbortController();
        const startedAt = now();

        try {
            let rejectedToolCallRounds = 0;
            let lastRejectedToolCallSignature = "";
            let repeatedRejectedToolCallRounds = 0;
            let response;
            while (true) {
                const history = this.#buildHistory();
                const requestResult = await this.#runtime.requestPlan(
                    message,
                    history,
                    {
                        onDelta: (delta) => {
                            this.#appendActiveTurnDelta(turnId, delta);
                        },
                        onReasoning: (delta) => {
                            this.#appendActiveTurnReasoning(turnId, delta);
                        },
                        onHeartbeat: () => {
                            this.#touchActiveTurn(turnId);
                        },
                    },
                    true,
                    this.#buildContextOptions(),
                    this.#activeRequestAbortController?.signal
                );
                response = requestResult.response;

                if (this.#isTurnCancelled(turnId)) {
                    return;
                }

                if (response.type !== "tool_call") {
                    break;
                }

                this.#appendMessage({
                    kind: "tool_call",
                    text:
                        response.message &&
                        !looksLikeStructuredToolMessage(response.message)
                            ? response.message
                            : "",
                    toolCalls: response.toolCalls,
                    durationMs: elapsedMilliseconds(startedAt),
                });

                this.#state.status = "executing";
                this.#notify();
                const executionResults = await this.executeToolCalls(
                    response.toolCalls
                );
                if (this.#isTurnCancelled(turnId)) {
                    return;
                }
                if (this.#state.lastError) {
                    return;
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
                        const errorMessage =
                            "The planner repeated the same rejected tool call after validation failure.";
                        this.#markActiveTurnError(turnId);
                        this.#appendMessage({
                            kind: "error",
                            text: errorMessage,
                        });
                        this.#state.status = "error";
                        this.#state.lastError = errorMessage;
                        this.#notify();
                        return;
                    }

                    if (
                        rejectedToolCallRounds > MAX_REJECTED_TOOL_CALL_RETRIES
                    ) {
                        const errorMessage =
                            "The planner produced too many rejected tool calls without converging.";
                        this.#markActiveTurnError(turnId);
                        this.#appendMessage({
                            kind: "error",
                            text: errorMessage,
                        });
                        this.#state.status = "error";
                        this.#state.lastError = errorMessage;
                        this.#notify();
                        return;
                    }
                }
                this.#resetActiveTurnDraft(turnId);
                this.#state.status = "thinking";
                this.#notify();
            }

            await this.#handleResponse(
                response,
                elapsedMilliseconds(startedAt),
                turnId
            );
        } catch (error) {
            if (this.#isAbortError(error) || this.#isTurnCancelled(turnId)) {
                return;
            }

            this.#state.pendingResponsePlaceholder = "";
            this.#state.status = "error";
            this.#state.lastError = String(error);
            this.#markActiveTurnError(turnId);
            this.#appendMessage({
                kind: "error",
                text: this.#state.lastError,
            });
        } finally {
            this.#state.pendingRequest = null;
            this.#state.pendingResponsePlaceholder = "";
            this.#activeRequestAbortController = null;
            this.#cancelledTurnIds.delete(turnId);
            this.#clearActiveTurn(turnId);
            this.#notify();
            void this.#drainQueue();
        }
    }

    /**
     * @returns {Promise<void>}
     */
    async #drainQueue() {
        if (this.#drainingQueue || this.#state.preflightState !== "ready") {
            return;
        }

        this.#drainingQueue = true;
        try {
            while (
                this.#queuedMessages.length > 0 &&
                this.#state.preflightState === "ready" &&
                !this.#state.pendingRequest
            ) {
                const nextMessage = this.#queuedMessages.shift();
                this.#state.queuedMessageCount = this.#queuedMessages.length;
                this.#notify();
                if (nextMessage) {
                    await this.#processMessage(nextMessage);
                }
                if (
                    this.#state.status === "error" ||
                    this.#state.status === "unavailable"
                ) {
                    break;
                }
            }
        } finally {
            this.#drainingQueue = false;
            this.#notify();
        }
    }

    /**
     * @returns {AgentConversationMessage[]}
     */
    #buildHistory() {
        return this.#state.messages
            .filter(
                (message) =>
                    message.kind === "user" ||
                    message.kind === "assistant" ||
                    message.kind === "clarification" ||
                    message.kind === "plan" ||
                    message.kind === "result" ||
                    message.kind === "tool_call" ||
                    message.kind === "tool_result"
            )
            .map((message) => {
                const text =
                    typeof message.text === "string"
                        ? message.text
                        : message.text
                          ? templateResultToString(message.text)
                          : "";

                if (message.kind === "tool_call") {
                    return /** @type {AgentConversationMessage} */ ({
                        id: String(message.id),
                        role: "assistant",
                        text,
                        kind: "tool_call",
                        toolCalls: message.toolCalls ?? [],
                    });
                }

                if (message.kind === "tool_result") {
                    return /** @type {AgentConversationMessage} */ ({
                        id: String(message.id),
                        role: "tool",
                        text,
                        kind: "tool_result",
                        toolCallId: message.toolCallId,
                        content: message.content,
                    });
                }

                const historyMessage =
                    /** @type {AgentConversationMessage} */ ({
                        id: String(message.id),
                        role: message.kind === "user" ? "user" : "assistant",
                        text,
                    });

                if (message.kind === "clarification") {
                    return /** @type {AgentConversationMessage} */ ({
                        ...historyMessage,
                        kind: "clarification",
                    });
                }

                return historyMessage;
            })
            .filter(
                (message) =>
                    message.text.length > 0 ||
                    message.kind === "tool_call" ||
                    message.kind === "tool_result"
            );
    }

    /**
     * @param {ChatPlannerResponse} response
     * @param {number | undefined} durationMs
     * @param {number} turnId
     * @returns {Promise<void>}
     */
    async #handleResponse(response, durationMs, turnId) {
        this.#clearActiveTurn(turnId);
        this.#state.pendingResponsePlaceholder = "";
        this.#state.lastResponseDurationMs = durationMs ?? null;

        if (response.type === "answer") {
            this.#appendMessage({
                kind: "assistant",
                text: response.message,
                durationMs: durationMs ?? null,
            });
            this.#state.status = "ready";
            this.#state.lastError = "";
            this.#notify();
            return;
        }

        if (response.type === "clarify") {
            const parsedClarification = parseClarificationMessage(
                response.message
            );
            const options =
                "options" in response && response.options?.length > 0
                    ? /** @type {ChatClarificationOption[]} */ (
                          response.options
                      )
                    : parsedClarification.options;
            this.#appendMessage({
                kind: "clarification",
                text:
                    options.length > 0
                        ? parsedClarification.text
                        : response.message,
                options: options.map((option) => ({
                    value: option.value,
                    label: option.label,
                    description: option.description,
                })),
                durationMs: durationMs ?? null,
            });
            this.#state.status = "clarification";
            this.#state.lastError = "";
            this.#notify();
            return;
        }

        if (response.type === "intent_program") {
            await this.#executeIntentProgram(
                response.program,
                durationMs ?? null
            );
            return;
        }

        if (response.type === "agent_program") {
            this.#appendMessage({
                kind: "assistant",
                text: "The planner returned an agent program. That path is not wired into the chat panel yet.",
            });
            this.#state.status = "ready";
            this.#state.lastError = "";
            this.#notify();
            return;
        }

        const exhaustiveCheck = /** @type {never} */ (response);
        this.#appendMessage({
            kind: "error",
            text: "Unsupported planner response: " + String(exhaustiveCheck),
        });
        this.#state.status = "error";
        this.#state.lastError = "Unsupported planner response.";
        this.#notify();
    }

    /**
     * Executes a planner-authored intent program and records the result.
     *
     * @param {IntentProgram} program
     * @param {number | null} durationMs
     * @returns {Promise<void>}
     */
    async #executeIntentProgram(program, durationMs) {
        const planLines = this.#runtime.summarizeIntentProgram(program);

        this.#appendMessage({
            kind: "plan",
            text: program.rationale ?? "The agent proposed an action plan.",
            lines: planLines,
            durationMs,
        });

        this.#state.status = "executing";
        this.#notify();

        const validation = this.#runtime.validateIntentProgram(program);
        if (!validation.ok || !validation.program) {
            const validationMessage = validation.errors.join("\n");
            this.#appendMessage({
                kind: "error",
                text: validationMessage,
            });
            this.#state.status = "error";
            this.#state.lastError = validationMessage;
            this.#notify();
            return;
        }

        const result = await this.#runtime.submitIntentProgram(
            validation.program
        );
        this.#appendMessage({
            kind: "result",
            text:
                "Executed " +
                result.executedActions +
                " action" +
                (result.executedActions === 1 ? "" : "s") +
                ".",
            content: result.content,
            lines: result.summaries,
        });
        this.#state.status = "ready";
        this.#state.lastError = "";
        this.#notify();
    }

    /**
     * Executes one planner tool call.
     *
     * @param {AgentToolCall} toolCall
     * @returns {Promise<ToolExecutionResult>}
     */
    async #executeToolCall(toolCall) {
        let argumentsObject;
        try {
            argumentsObject = this.#parseToolArguments(toolCall.arguments);
        } catch {
            return {
                toolCallId: toolCall.callId,
                text: formatToolCallRejection(toolCall.name, [
                    "Tool arguments must be valid JSON.",
                ]),
                rejected: true,
            };
        }
        const validation = validateToolArgumentsShape(
            toolCall.name,
            argumentsObject
        );

        if (!validation.ok) {
            return {
                toolCallId: toolCall.callId,
                text: formatToolCallRejection(toolCall.name, validation.errors),
                rejected: true,
            };
        }

        if (
            toolCall.name === "expandViewNode" ||
            toolCall.name === "collapseViewNode" ||
            toolCall.name === "setViewVisibility" ||
            toolCall.name === "clearViewVisibility"
        ) {
            const view = this.#runtime.resolveViewSelector(
                argumentsObject.selector
            );
            if (!view) {
                return {
                    toolCallId: toolCall.callId,
                    text: formatToolCallRejection(toolCall.name, [
                        "Selector did not resolve in the current view hierarchy.",
                    ]),
                    rejected: true,
                };
            }

            if (toolCall.name === "expandViewNode") {
                return this.#executeViewStateMutation(toolCall, {
                    domain: "agent_context",
                    field: "collapsed",
                    selector: argumentsObject.selector,
                    readState: () =>
                        this.#expandedViewNodeKeys.has(
                            makeViewSelectorKey(argumentsObject.selector)
                        ),
                    applyState: () => {
                        this.expandViewNode(argumentsObject.selector);
                    },
                    changedText: "Expanded the requested view branch.",
                    noopText: "The requested view branch was already expanded.",
                });
            }

            if (toolCall.name === "collapseViewNode") {
                return this.#executeViewStateMutation(toolCall, {
                    domain: "agent_context",
                    field: "collapsed",
                    selector: argumentsObject.selector,
                    readState: () =>
                        this.#expandedViewNodeKeys.has(
                            makeViewSelectorKey(argumentsObject.selector)
                        ),
                    applyState: () => {
                        this.collapseViewNode(argumentsObject.selector);
                    },
                    changedText: "Collapsed the requested view branch.",
                    noopText:
                        "The requested view branch was already collapsed.",
                });
            }

            if (toolCall.name === "setViewVisibility") {
                return this.#executeViewStateMutation(toolCall, {
                    domain: "user_visibility",
                    field: "visible",
                    selector: argumentsObject.selector,
                    readState: () => view.isVisible(),
                    applyState: () => {
                        this.#runtime.setViewVisibility(
                            argumentsObject.selector,
                            argumentsObject.visibility
                        );
                    },
                    changedText: "Updated the requested view visibility.",
                    noopText:
                        "The view was already in the requested visibility state.",
                });
            }

            return this.#executeViewStateMutation(toolCall, {
                domain: "user_visibility",
                field: "visible",
                selector: argumentsObject.selector,
                readState: () => view.isVisible(),
                applyState: () => {
                    this.#runtime.clearViewVisibility(argumentsObject.selector);
                },
                changedText: "Cleared the requested view visibility override.",
                noopText: "The visibility override was already clear.",
            });
        }

        if (toolCall.name === "submitIntentProgram") {
            const intentProgramResult = await this.#runtime.submitIntentProgram(
                argumentsObject.program
            );

            return {
                toolCallId: toolCall.callId,
                text: this.#runtime.summarizeExecutionResult(
                    intentProgramResult
                ),
                content: intentProgramResult.content,
                rejected: false,
            };
        }

        if (toolCall.name === "resolveSelectionAggregationCandidate") {
            let context;
            try {
                context = this.#runtime.getAgentContext?.();
            } catch (error) {
                return {
                    toolCallId: toolCall.callId,
                    text: formatToolCallRejection(toolCall.name, [
                        String(error),
                    ]),
                    rejected: true,
                };
            }

            if (!context) {
                return {
                    toolCallId: toolCall.callId,
                    text: formatToolCallRejection(toolCall.name, [
                        "Planner context is not available.",
                    ]),
                    rejected: true,
                };
            }

            try {
                const resolution = resolveSelectionAggregationCandidate(
                    context,
                    argumentsObject.candidateId,
                    argumentsObject.aggregation
                );
                return {
                    toolCallId: toolCall.callId,
                    text:
                        "Resolved " +
                        resolution.title +
                        " for " +
                        argumentsObject.candidateId +
                        ".",
                    rejected: false,
                    content: resolution,
                };
            } catch (error) {
                return {
                    toolCallId: toolCall.callId,
                    text: formatToolCallRejection(toolCall.name, [
                        String(error),
                    ]),
                    rejected: true,
                };
            }
        }

        throw new Error("Unsupported planner tool: " + toolCall.name);
    }

    /**
     * Executes a state mutation tool and returns a structured summary.
     *
     * @param {AgentToolCall} toolCall
     * @param {{
     *     domain: AgentViewStateChange["domain"];
     *     field: AgentViewStateChange["field"];
     *     selector: import("@genome-spy/core/view/viewSelectors.js").ViewSelector;
     *     readState: () => boolean;
     *     applyState: () => void;
     *     changedText: string;
     *     noopText: string;
     * }} options
     * @returns {ToolExecutionResult}
     */
    #executeViewStateMutation(toolCall, options) {
        const before = options.readState();
        options.applyState();
        const after = options.readState();
        const changed = before !== after;

        return {
            toolCallId: toolCall.callId,
            text: changed ? options.changedText : options.noopText,
            rejected: false,
            content: /** @type {AgentViewStateChange} */ ({
                kind: "view_state_change",
                domain: options.domain,
                field: options.field,
                selector: options.selector,
                before,
                after,
                changed,
            }),
        };
    }

    /**
     * @param {unknown} toolArguments
     * @returns {Record<string, any>}
     */
    #parseToolArguments(toolArguments) {
        if (typeof toolArguments === "string") {
            return JSON.parse(toolArguments);
        }

        if (!toolArguments || typeof toolArguments !== "object") {
            throw new Error("Planner tool arguments must be an object.");
        }

        return /** @type {Record<string, any>} */ (toolArguments);
    }

    /**
     * Resets the active-turn draft after a tool call and before the next
     * planner request reuses the same turn id.
     *
     * @param {number} turnId
     */
    #resetActiveTurnDraft(turnId) {
        if (!this.#activeTurn || this.#activeTurn.turnId !== turnId) {
            return;
        }

        this.#activeTurn = {
            ...this.#activeTurn,
            status: "working",
            placeholder: "Working...",
            draftText: "",
            reasoningText: "",
            heartbeatTick: 0,
        };
        this.#notifyActiveTurn();
    }

    /**
     * @returns {AgentContextOptions}
     */
    #buildContextOptions() {
        return {
            expandedViewNodeKeys: Array.from(this.#expandedViewNodeKeys),
        };
    }

    /**
     * @param {number} turnId
     * @returns {boolean}
     */
    #isTurnCancelled(turnId) {
        return this.#cancelledTurnIds.has(turnId);
    }

    /**
     * @param {unknown} error
     * @returns {boolean}
     */
    #isAbortError(error) {
        return (
            (error instanceof DOMException && error.name === "AbortError") ||
            (error instanceof Error && error.name === "AbortError")
        );
    }

    /**
     * @returns {number}
     */
    #beginActiveTurn() {
        const turnId = this.#nextTurnId++;
        this.#activeTurn = {
            turnId,
            status: "working",
            placeholder: "Working...",
            draftText: "",
            reasoningText: "",
            heartbeatTick: 0,
        };
        this.#notifyActiveTurn();
        return turnId;
    }

    /**
     * @param {number} turnId
     * @param {string} delta
     */
    #appendActiveTurnDelta(turnId, delta) {
        if (!delta || !this.#activeTurn || this.#activeTurn.turnId !== turnId) {
            return;
        }

        this.#activeTurn = {
            ...this.#activeTurn,
            status: "streaming",
            draftText: this.#activeTurn.draftText + delta,
        };
        this.#notifyActiveTurn();
    }

    /**
     * @param {number} turnId
     * @param {string} delta
     */
    #appendActiveTurnReasoning(turnId, delta) {
        if (!delta || !this.#activeTurn || this.#activeTurn.turnId !== turnId) {
            return;
        }

        this.#activeTurn = {
            ...this.#activeTurn,
            reasoningText: this.#activeTurn.reasoningText + delta,
        };
        this.#notifyActiveTurn();
    }

    /**
     * @param {number} turnId
     */
    #touchActiveTurn(turnId) {
        if (!this.#activeTurn || this.#activeTurn.turnId !== turnId) {
            return;
        }

        this.#activeTurn = {
            ...this.#activeTurn,
            heartbeatTick: this.#activeTurn.heartbeatTick + 1,
        };
        this.#notifyActiveTurn();
    }

    /**
     * @param {number} turnId
     */
    #markActiveTurnError(turnId) {
        if (!this.#activeTurn || this.#activeTurn.turnId !== turnId) {
            return;
        }

        this.#activeTurn = {
            ...this.#activeTurn,
            status: "error",
        };
        this.#notifyActiveTurn();
    }

    /**
     * @param {number} turnId
     */
    #clearActiveTurn(turnId) {
        if (!this.#activeTurn || this.#activeTurn.turnId !== turnId) {
            return;
        }

        this.#activeTurn = null;
        this.#notifyActiveTurn();
    }

    /**
     * @returns {AgentActiveTurnSnapshot | null}
     */
    #cloneActiveTurn() {
        if (!this.#activeTurn) {
            return null;
        }

        return {
            ...this.#activeTurn,
        };
    }

    /**
     * Emits the current active-turn snapshot to all listeners.
     */
    #notifyActiveTurn() {
        const snapshot = this.#cloneActiveTurn();
        for (const listener of this.#activeTurnListeners) {
            listener(snapshot);
        }
    }

    /**
     * @param {Omit<AgentChatMessage, "id">} message
     */
    #appendMessage(message) {
        this.#state.messages = [
            ...this.#state.messages,
            {
                id: this.#nextMessageId++,
                ...message,
            },
        ];
    }

    /**
     * Emits the current snapshot to all listeners.
     */
    #notify() {
        const snapshot = this.getSnapshot();
        for (const listener of this.#listeners) {
            listener(snapshot);
        }
    }
}
