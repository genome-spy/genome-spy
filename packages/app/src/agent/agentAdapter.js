import { getAgentContext } from "./contextBuilder.js";
import {
    submitIntentActions,
    summarizeExecutionResult,
} from "./intentProgramExecutor.js";
import { validateIntentBatch } from "./intentProgramValidator.js";
import { summarizeProvenanceActions } from "./actionCatalog.js";
import { viewSettingsSlice } from "../viewSettingsSlice.js";
import { makeViewSelectorKey } from "../viewSettingsUtils.js";
import { resolveViewSelector } from "@genome-spy/core/view/viewSelectors.js";
import templateResultToString from "../utils/templateResultToString.js";
import {
    collectVisibleSampleGroups,
    collectVisibleSampleIds,
} from "./sampleHierarchyScope.js";

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
 */
export function createAgentAdapter(app) {
    return {
        getAgentContext: (
            /** @type {AgentContextOptions} */ contextOptions = getCurrentAgentContextOptions(
                app
            )
        ) => getAgentContext(app, contextOptions),
        validateIntentBatch: (/** @type {unknown} */ batch) =>
            validateIntentBatch(app, batch),
        submitIntentActions: (
            /** @type {import("./types.js").IntentBatch} */ batch,
            /** @type {{submissionKind?: "agent" | "bookmark" | "user"}} */ options
        ) => submitIntentActions(app, batch, options),
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
        getMetadataAttributeSummarySource: (
            /** @type {import("../sampleView/types.d.ts").AttributeIdentifier} */ attribute
        ) => getMetadataAttributeSummarySource(app, attribute),
        getGroupedMetadataAttributeSummarySource: (
            /** @type {import("../sampleView/types.d.ts").AttributeIdentifier} */ attribute
        ) => getGroupedMetadataAttributeSummarySource(app, attribute),
        jumpToProvenanceState: (/** @type {string} */ provenanceId) =>
            jumpToProvenanceState(app, provenanceId),
        jumpToInitialProvenanceState: () => jumpToInitialProvenanceState(app),
        summarizeProvenanceActionsSince: (/** @type {number} */ startIndex) =>
            summarizeProvenanceActions(
                app,
                app.provenance.getActionHistory().slice(startIndex)
            ),
        summarizeExecutionResult,
        requestAgentTurn: (
            /** @type {string} */ message,
            /** @type {Array<string | AgentConversationMessage>} */ history = [],
            /** @type {import("./agentSessionController.js").AgentStreamCallbacks} */ streamCallbacks = {},
            /** @type {boolean} */ allowStreaming = true,
            /** @type {AgentContextOptions} */ contextOptions = {}
        ) =>
            requestAgentTurn(app, {
                message,
                history,
                streamCallbacks,
                allowStreaming,
                contextOptions,
            }),
    };
}

/**
 * @param {import("../app.js").default} app
 * @param {import("../sampleView/types.d.ts").AttributeIdentifier} attribute
 * @returns {import("./types.d.ts").AgentMetadataAttributeSummarySource | undefined}
 */
function getMetadataAttributeSummarySource(app, attribute) {
    if (
        attribute?.type !== "SAMPLE_ATTRIBUTE" ||
        typeof attribute.specifier !== "string"
    ) {
        return undefined;
    }

    const sampleView = app.getSampleView();
    if (!sampleView) {
        return undefined;
    }

    const sampleHierarchy = sampleView.sampleHierarchy;
    if (!sampleHierarchy) {
        return undefined;
    }

    const info =
        sampleView.compositeAttributeInfoSource.getAttributeInfo(attribute);

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
 * @param {import("../app.js").default} app
 * @param {import("../sampleView/types.d.ts").AttributeIdentifier} attribute
 * @returns {import("./types.d.ts").AgentGroupedMetadataAttributeSummarySource | undefined}
 */
function getGroupedMetadataAttributeSummarySource(app, attribute) {
    if (
        attribute?.type !== "SAMPLE_ATTRIBUTE" ||
        typeof attribute.specifier !== "string"
    ) {
        return undefined;
    }

    const sampleView = app.getSampleView();
    if (!sampleView) {
        return undefined;
    }

    const sampleHierarchy = sampleView.sampleHierarchy;
    if (!sampleHierarchy) {
        return undefined;
    }

    const info =
        sampleView.compositeAttributeInfoSource.getAttributeInfo(attribute);

    const attributeName = attribute.specifier;
    const metadata = sampleHierarchy.sampleMetadata.entities;

    return {
        attribute,
        title: templateResultToString(info.title),
        description: info.description,
        dataType: info.type,
        scope: "visible_groups",
        groupLevels: sampleHierarchy.groupMetadata.map((entry, level) => {
            const groupInfo =
                sampleView.compositeAttributeInfoSource.getAttributeInfo(
                    entry.attribute
                );

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
 * @param {import("../app.js").default} app
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
async function requestAgentTurn(app, options) {
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
 * @param {import("../app.js").default} app
 * @param {string} provenanceId
 * @returns {boolean}
 */
function jumpToProvenanceState(app, provenanceId) {
    const currentIndex = app.provenance.getCurrentIndex();
    app.provenance.activateState(provenanceId);
    return app.provenance.getCurrentIndex() !== currentIndex;
}

/**
 * @param {import("../app.js").default} app
 * @returns {boolean}
 */
function jumpToInitialProvenanceState(app) {
    const currentIndex = app.provenance.getCurrentIndex();
    app.provenance.activateInitialState();
    return app.provenance.getCurrentIndex() !== currentIndex;
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
