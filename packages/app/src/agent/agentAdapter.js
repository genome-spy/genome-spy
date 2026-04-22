import { getAgentContext as buildAgentContext } from "./contextBuilder.js";
import {
    submitIntentActions as submitIntentActionsForApp,
    summarizeExecutionResult,
} from "./intentProgramExecutor.js";
import { summarizeProvenanceActions } from "./actionCatalog.js";
import templateResultToString from "../utils/templateResultToString.js";
import {
    collectVisibleSampleGroups,
    collectVisibleSampleIds,
} from "./sampleHierarchyScope.js";
import { getAgentState } from "./agentState.js";
import { buildResponsesToolDefinitions } from "./toolCatalog.js";
import { getAgentVolatileContext as buildAgentVolatileContext } from "./volatileContextBuilder.js";

/**
 * @typedef {import("../agentApi/index.js").AgentApi} AgentApi
 */

const DEFAULT_AGENT_BASE_URL = "http://127.0.0.1:8000";

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
 * @typedef {import("./types.d.ts").AgentConversationMessage} AgentConversationMessage
 * @typedef {import("./types.d.ts").AgentContextOptions} AgentContextOptions
 * @typedef {import("./types.d.ts").AgentTurnRequest} AgentTurnRequest
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
 * @param {import("../app.js").default} app
 * @param {AgentApi} agentApi
 */
export function createAgentAdapter(app, agentApi) {
    const agentState = getAgentState(app);

    /**
     * @param {import("../sampleView/types.d.ts").AttributeIdentifier} attribute
     * @returns {import("./types.d.ts").AgentMetadataAttributeSummarySource | undefined}
     */
    function getMetadataAttributeSummarySource(attribute) {
        if (
            attribute?.type !== "SAMPLE_ATTRIBUTE" ||
            typeof attribute.specifier !== "string"
        ) {
            return undefined;
        }

        const sampleHierarchy = agentApi.getSampleHierarchy();
        if (!sampleHierarchy) {
            return undefined;
        }

        const info = agentApi.getAttributeInfo(attribute);

        const sampleIds = collectVisibleSampleIds(sampleHierarchy.rootGroup);
        const metadata = sampleHierarchy.sampleMetadata.entities;
        const attributeName = attribute.specifier;

        return {
            attribute,
            title: templateResultToString(info.title),
            description: info.description,
            dataType: info.type,
            scope: "visible_samples",
            sampleIds,
            values: sampleIds.map(
                (sampleId) => metadata[sampleId]?.[attributeName]
            ),
        };
    }

    /**
     * @param {import("../sampleView/types.d.ts").AttributeIdentifier} attribute
     * @returns {import("./types.d.ts").AgentGroupedMetadataAttributeSummarySource | undefined}
     */
    function getGroupedMetadataAttributeSummarySource(attribute) {
        if (
            attribute?.type !== "SAMPLE_ATTRIBUTE" ||
            typeof attribute.specifier !== "string"
        ) {
            return undefined;
        }

        const sampleHierarchy = agentApi.getSampleHierarchy();
        if (!sampleHierarchy) {
            return undefined;
        }

        const info = agentApi.getAttributeInfo(attribute);

        const attributeName = attribute.specifier;
        const metadata = sampleHierarchy.sampleMetadata.entities;

        return {
            attribute,
            title: templateResultToString(info.title),
            description: info.description,
            dataType: info.type,
            scope: "visible_groups",
            groupLevels: sampleHierarchy.groupMetadata.map((entry, level) => {
                const groupInfo = agentApi.getAttributeInfo(entry.attribute);

                return {
                    level,
                    attribute: entry.attribute,
                    title: templateResultToString(groupInfo.title),
                };
            }),
            groups: collectVisibleSampleGroups(sampleHierarchy.rootGroup),
            valuesBySampleId: Object.fromEntries(
                Object.entries(metadata).map(([sampleId, values]) => [
                    sampleId,
                    values?.[attributeName],
                ])
            ),
        };
    }

    /**
     * @param {{
     *   message: string,
     *   history?: Array<string | AgentConversationMessage>,
     *   streamCallbacks?: import("./agentSessionController.js").AgentStreamCallbacks,
     *   allowStreaming?: boolean,
     *   contextOptions?: AgentContextOptions,
     *   signal?: AbortSignal
     * }} options
     * @returns {Promise<{ response: import("./types.js").AgentTurnResponse, trace: Record<string, any> }>}
     */
    async function requestAgentTurnImpl(options) {
        const baseUrl = agentState.agentBaseUrl ?? DEFAULT_AGENT_BASE_URL;
        const startedAt = now();
        const contextStartedAt = now();
        const context = buildAgentContext(agentApi, options.contextOptions);
        const volatileContext = getAgentVolatileContext();
        const contextBuildMs = elapsedMilliseconds(contextStartedAt);
        const history = normalizeConversationHistory(options.history ?? []);
        const tools = buildResponsesToolDefinitions();
        const shouldStream =
            options.allowStreaming !== false &&
            shouldUseStreaming(options.streamCallbacks);
        if (options.signal?.aborted) {
            throw createAbortError();
        }
        /** @type {AgentTurnRequest} */
        const requestPayload = {
            message: options.message,
            history,
            context,
            volatileContext,
            tools,
        };

        const requestStartedAt = now();
        const response = await fetch(baseUrl + "/v1/agent-turn", {
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
                "Agent turn request failed with status " + response.status + "."
            );
        }

        if (
            shouldStream &&
            response.headers.get("content-type")?.includes("text/event-stream")
        ) {
            const parseStartedAt = now();
            const streamedResponse = await consumeAgentTurnStream(
                response,
                options.streamCallbacks ?? {}
            );
            const responseParseMs = elapsedMilliseconds(parseStartedAt);

            return {
                response: streamedResponse.response,
                trace: {
                    message: options.message,
                    contextBuildMs,
                    requestMs,
                    responseParseMs,
                    serverTiming:
                        response.headers.get("server-timing") ?? "n/a",
                    agentServerTotalMs:
                        response.headers.get("x-genomespy-agent-total-ms") ??
                        "n/a",
                    totalMs: elapsedMilliseconds(startedAt),
                },
            };
        } else {
            const parseStartedAt = now();
            const parsedResponse = await response.json();
            const responseParseMs = elapsedMilliseconds(parseStartedAt);

            return {
                response: parsedResponse,
                trace: {
                    message: options.message,
                    contextBuildMs,
                    requestMs,
                    responseParseMs,
                    serverTiming:
                        response.headers.get("server-timing") ?? "n/a",
                    agentServerTotalMs:
                        response.headers.get("x-genomespy-agent-total-ms") ??
                        "n/a",
                    totalMs: elapsedMilliseconds(startedAt),
                },
            };
        }
    }

    /**
     * @param {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} selector
     * @param {boolean} visibility
     */
    function setViewVisibility(selector, visibility) {
        return agentApi.setViewVisibility(selector, visibility);
    }

    /**
     * @param {string} provenanceId
     * @returns {boolean}
     */
    function jumpToProvenanceState(provenanceId) {
        return agentApi.jumpToProvenanceState(provenanceId);
    }

    /**
     * @returns {boolean}
     */
    function jumpToInitialProvenanceState() {
        return agentApi.jumpToInitialProvenanceState();
    }

    /**
     * @returns {import("./types.d.ts").AgentContextOptions}
     */
    /**
     * @param {AgentContextOptions} [contextOptions]
     * @returns {ReturnType<typeof buildAgentContext>}
     */
    function getAgentContext(
        contextOptions = {
            expandedViewNodeKeys:
                agentState.agentSessionController?.getSnapshot()
                    .expandedViewNodeKeys ?? [],
        }
    ) {
        return buildAgentContext(agentApi, contextOptions);
    }

    /**
     * @returns {import("./types.d.ts").AgentVolatileContext}
     */
    function getAgentVolatileContext() {
        return buildAgentVolatileContext(agentApi);
    }

    /**
     * @param {import("./types.js").IntentBatch} batch
     * @param {{submissionKind?: "agent" | "bookmark" | "user"}} options
     */
    function submitIntentActions(batch, options) {
        return submitIntentActionsForApp(agentApi, batch, options);
    }

    /**
     * @param {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} selector
     * @returns {import("@genome-spy/core/view/view.js").default | undefined}
     */
    function resolveViewSelector(selector) {
        return agentApi.resolveViewSelector(selector);
    }

    /**
     * @param {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} selector
     * @param {boolean} visibility
     */
    /**
     * @param {number} startIndex
     * @returns {import("./types.d.ts").IntentBatchSummaryLine[]}
     */
    function summarizeProvenanceActionsSince(startIndex) {
        return summarizeProvenanceActions(
            agentApi,
            agentApi.getActionHistory().slice(startIndex)
        );
    }

    /**
     * @param {string} message
     * @param {Array<string | AgentConversationMessage>} [history]
     * @param {import("./agentSessionController.js").AgentStreamCallbacks} [streamCallbacks]
     * @param {boolean} [allowStreaming]
     * @param {AgentContextOptions} [contextOptions]
     * @returns {Promise<{ response: import("./types.js").AgentTurnResponse, trace: Record<string, any> }>}
     */
    function requestAgentTurn(
        message,
        history = [],
        streamCallbacks = {},
        allowStreaming = true,
        contextOptions = {}
    ) {
        return requestAgentTurnImpl({
            message,
            history,
            streamCallbacks,
            allowStreaming,
            contextOptions,
        });
    }

    return {
        getAgentContext,
        getAgentVolatileContext,
        submitIntentActions,
        resolveViewSelector,
        setViewVisibility,
        getMetadataAttributeSummarySource,
        getGroupedMetadataAttributeSummarySource,
        jumpToProvenanceState,
        jumpToInitialProvenanceState,
        summarizeProvenanceActionsSince,
        summarizeExecutionResult,
        requestAgentTurn,
    };
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
 * @returns {Promise<{ response: import("./types.js").AgentTurnResponse }>}
 */
async function consumeAgentTurnStream(response, streamCallbacks) {
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
                        finalResponse = handleAgentTurnStreamEvent(
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
        finalResponse = handleAgentTurnStreamEvent(
            eventName,
            trailingLine,
            streamCallbacks,
            finalResponse
        );
    }

    if (!finalResponse) {
        throw new Error(
            "Streaming response ended without a final agent-turn event."
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
 * @param {import("./types.js").AgentTurnResponse | null} finalResponse
 * @returns {import("./types.js").AgentTurnResponse | null}
 */
function handleAgentTurnStreamEvent(
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
        return /** @type {import("./types.js").AgentTurnResponse} */ ({
            type: payload.response.type,
            message: payload.response.message,
            ...(payload.response.toolCalls
                ? { toolCalls: payload.response.toolCalls }
                : {}),
        });
    }

    if (eventName === "error") {
        throw new Error(
            payload.message ?? "Streaming agent-turn request failed."
        );
    }

    return finalResponse;
}
