import { sampleSlice } from "../sampleView/state/sampleSlice.js";
import { paramProvenanceSlice } from "../state/paramProvenanceSlice.js";
import { viewSettingsSlice } from "../viewSettingsSlice.js";
import templateResultToString from "../utils/templateResultToString.js";
import generatedActionCatalog from "./generated/generatedActionCatalog.json" with { type: "json" };
import generatedActionSummaries from "./generated/generatedActionSummaries.json" with { type: "json" };

/**
 * @typedef {Object} ActionCatalogEntry
 * @property {(payload: any) => import("@reduxjs/toolkit").PayloadAction<any>} actionCreator
 * @property {string} description
 * @property {string | undefined} [usage]
 * @property {string} payloadType
 * @property {import("./types.js").AgentPayloadField[]} payloadFields
 * @property {unknown} examplePayload
 * @property {unknown[]} examples
 */

/**
 * @typedef {{
 *     type: string;
 *     payload?: unknown;
 *     provenanceId?: string;
 *     summary?: string;
 * }} SummarizableAction
 */

/**
 * @typedef {{
 *     type: string;
 *     payload: unknown;
 *     provenanceId?: string;
 *     summary?: string;
 * }} ActionInfoInput
 */

/**
 * @param {import("./types.js").AgentActionType} actionType
 * @returns {(payload: any) => import("@reduxjs/toolkit").PayloadAction<any>}
 */
function getActionCreator(actionType) {
    if (actionType.startsWith("sampleView/")) {
        return /** @type {Record<string, any>} */ (sampleSlice.actions)[
            actionType.slice("sampleView/".length)
        ];
    }

    if (actionType.startsWith("paramProvenance/")) {
        return /** @type {Record<string, any>} */ (
            paramProvenanceSlice.actions
        )[actionType.slice("paramProvenance/".length)];
    }

    if (actionType.startsWith("viewSettings/")) {
        return /** @type {Record<string, any>} */ (viewSettingsSlice.actions)[
            actionType.slice("viewSettings/".length)
        ];
    }

    throw new Error("Unsupported agent actionType " + actionType + ".");
}

/**
 * @type {Record<import("./types.js").AgentActionType, ActionCatalogEntry>}
 */
export const actionCatalog =
    /** @type {Record<import("./types.js").AgentActionType, ActionCatalogEntry>} */ (
        /** @type {unknown} */ (
            Object.fromEntries(
                generatedActionCatalog.map((entry) => {
                    const actionType =
                        /** @type {import("./types.js").AgentActionType} */ (
                            entry.actionType
                        );
                    return [
                        actionType,
                        {
                            ...entry,
                            actionCreator: getActionCreator(actionType),
                        },
                    ];
                })
            )
        )
    );

/**
 * @returns {import("./types.js").AgentActionCatalogEntry[]}
 */
export function listAgentActions() {
    return generatedActionCatalog.map((entry) => ({
        ...entry,
        actionType: /** @type {import("./types.js").AgentActionType} */ (
            entry.actionType
        ),
    }));
}

/**
 * @returns {import("./types.js").AgentIntentActionSummary[]}
 */
export function listAgentIntentActionSummaries() {
    return generatedActionSummaries.map((entry) => ({
        actionType: /** @type {import("./types.js").AgentActionType} */ (
            entry.actionType
        ),
        description: entry.description,
    }));
}

/**
 * @param {import("./types.js").AgentActionType} actionType
 */
export function getActionCatalogEntry(actionType) {
    return actionCatalog[actionType];
}

/**
 * @param {import("../agentApi/index.js").AgentApi} agentApi
 * @param {import("./types.js").IntentBatch} batch
 * @returns {import("./types.js").IntentBatchSummaryLine[]}
 */
export function summarizeIntentBatch(agentApi, batch) {
    const actions = batch.steps.map(
        (step) =>
            /** @type {ActionInfoInput} */ (
                getActionCatalogEntry(step.actionType).actionCreator(
                    step.payload
                )
            )
    );
    return summarizeActions(agentApi, actions);
}

/**
 * @param {import("../agentApi/index.js").AgentApi} agentApi
 * @param {SummarizableAction[]} actions
 * @returns {import("./types.js").IntentBatchSummaryLine[]}
 */
export const summarizeProvenanceActions = summarizeActions;

/**
 * @param {import("../agentApi/index.js").AgentApi} agentApi
 * @param {SummarizableAction[]} actions
 * @returns {import("./types.js").IntentBatchSummaryLine[]}
 */
function summarizeActions(agentApi, actions) {
    return actions.map((action) => {
        const info = agentApi.getActionInfo(
            /** @type {import("./agentContextTypes.d.ts").AgentProvenanceAction} */ (
                action
            )
        );
        const content = info?.provenanceTitle ?? info?.title ?? action.type;
        return {
            content,
            text: templateResultToString(content),
        };
    });
}
