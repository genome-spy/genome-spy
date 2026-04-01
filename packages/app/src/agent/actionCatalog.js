import { sampleSlice } from "../sampleView/state/sampleSlice.js";
import { getActionInfo } from "../sampleView/state/actionInfo.js";
import templateResultToString from "../utils/templateResultToString.js";
import { generatedActionCatalog } from "./generatedActionCatalog.js";

/**
 * @param {import("../app.js").default} app
 * @returns {import("../sampleView/compositeAttributeInfoSource.js").AttributeInfoSource}
 */
function getAttributeInfoSource(app) {
    const sampleView = app.getSampleView();
    if (!sampleView) {
        throw new Error("SampleView is not available.");
    }

    return sampleView.compositeAttributeInfoSource.getAttributeInfo.bind(
        sampleView.compositeAttributeInfoSource
    );
}

/**
 * @typedef {Object} ActionCatalogEntry
 * @property {(payload: any) => import("@reduxjs/toolkit").PayloadAction<any>} actionCreator
 * @property {string} description
 * @property {string} payloadType
 * @property {string} payloadDescription
 * @property {import("./types.js").AgentPayloadField[]} payloadFields
 * @property {Record<string, any>} examplePayload
 */

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
                            actionCreator: sampleSlice.actions[actionType],
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
 * @param {import("./types.js").AgentActionType} actionType
 */
export function getActionCatalogEntry(actionType) {
    return actionCatalog[actionType];
}

/**
 * @param {import("../app.js").default} app
 * @param {import("./types.js").IntentProgram} program
 * @returns {string[]}
 */
export function summarizeIntentProgram(app, program) {
    const getAttributeInfo = getAttributeInfoSource(app);

    return program.steps.map((step) => {
        const action = getActionCatalogEntry(step.actionType).actionCreator(
            step.payload
        );
        const info = getActionInfo(action, getAttributeInfo);
        const title = info?.provenanceTitle ?? info?.title ?? step.actionType;
        return templateResultToString(title);
    });
}
