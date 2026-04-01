import { sampleSlice } from "../sampleView/state/sampleSlice.js";
import { getActionInfo } from "../sampleView/state/actionInfo.js";
import templateResultToString from "../utils/templateResultToString.js";
import { generatedActionCatalog } from "./generatedActionCatalog.js";

const VALID_QUANTITATIVE_OPERATORS = new Set(["lt", "lte", "eq", "gte", "gt"]);
const VALID_THRESHOLD_OPERATORS = new Set(["lt", "lte"]);

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
 * @param {any} attribute
 * @returns {attribute is import("../sampleView/types.js").AttributeIdentifier}
 */
function isAttributeIdentifier(attribute) {
    return (
        !!attribute &&
        typeof attribute === "object" &&
        typeof attribute.type === "string"
    );
}

/**
 * @param {Record<string, any>} payload
 * @returns {string[]}
 */
function validateAttributePayload(payload) {
    if (!isAttributeIdentifier(payload.attribute)) {
        return ["payload.attribute must be an attribute identifier."];
    }

    return [];
}

/**
 * @param {Record<string, any>} payload
 * @returns {string[]}
 */
function validateThresholdPayload(payload) {
    const errors = validateAttributePayload(payload);

    if (!Array.isArray(payload.thresholds) || payload.thresholds.length === 0) {
        errors.push("payload.thresholds must be a non-empty array.");
        return errors;
    }

    for (const [index, threshold] of payload.thresholds.entries()) {
        if (!threshold || typeof threshold !== "object") {
            errors.push("payload.thresholds[" + index + "] must be an object.");
            continue;
        }

        if (!VALID_THRESHOLD_OPERATORS.has(threshold.operator)) {
            errors.push(
                "payload.thresholds[" +
                    index +
                    "].operator must be one of lt, lte."
            );
        }

        if (
            typeof threshold.operand !== "number" ||
            !isFinite(threshold.operand)
        ) {
            errors.push(
                "payload.thresholds[" +
                    index +
                    "].operand must be a finite number."
            );
        }
    }

    return errors;
}

/**
 * @param {Record<string, any>} payload
 * @returns {string[]}
 */
function validateFilterByNominalPayload(payload) {
    const errors = validateAttributePayload(payload);
    if (!Array.isArray(payload.values)) {
        errors.push("payload.values must be an array.");
    }
    return errors;
}

/**
 * @param {Record<string, any>} payload
 * @returns {string[]}
 */
function validateFilterByQuantitativePayload(payload) {
    const errors = validateAttributePayload(payload);
    if (!VALID_QUANTITATIVE_OPERATORS.has(payload.operator)) {
        errors.push("payload.operator must be one of lt, lte, eq, gte, gt.");
    }
    if (typeof payload.operand !== "number" || !isFinite(payload.operand)) {
        errors.push("payload.operand must be a finite number.");
    }
    return errors;
}

/**
 * @param {Record<string, any>} payload
 * @returns {string[]}
 */
function validateRetainFirstNCategoriesPayload(payload) {
    const errors = validateAttributePayload(payload);
    if (!Number.isInteger(payload.n) || payload.n <= 0) {
        errors.push("payload.n must be a positive integer.");
    }
    return errors;
}

/**
 * @type {Partial<Record<import("./types.js").AgentActionType, (payload: Record<string, any>) => string[]>>}
 */
const validatePayloadByActionType = {
    sortBy: validateAttributePayload,
    filterByNominal: validateFilterByNominalPayload,
    filterByQuantitative: validateFilterByQuantitativePayload,
    groupByNominal: validateAttributePayload,
    groupToQuartiles: validateAttributePayload,
    groupByThresholds: validateThresholdPayload,
    retainFirstNCategories: validateRetainFirstNCategoriesPayload,
};

/**
 * @typedef {Object} ActionCatalogEntry
 * @property {(payload: any) => import("@reduxjs/toolkit").PayloadAction<any>} actionCreator
 * @property {string} description
 * @property {string} payloadType
 * @property {string} payloadDescription
 * @property {import("./types.js").AgentPayloadField[]} payloadFields
 * @property {Record<string, any>} examplePayload
 * @property {(payload: Record<string, any>) => string[]} validatePayload
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
                            validatePayload:
                                validatePayloadByActionType[actionType] ??
                                (() => []),
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
