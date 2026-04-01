import { sampleSlice } from "../sampleView/state/sampleSlice.js";
import { getActionInfo } from "../sampleView/state/actionInfo.js";
import templateResultToString from "../utils/templateResultToString.js";

const VALID_QUANTITATIVE_OPERATORS = new Set(["lt", "lte", "eq", "gte", "gt"]);
const VALID_THRESHOLD_OPERATORS = new Set(["lt", "lte"]);

/**
 * @param {string} name
 * @param {string} type
 * @param {string} description
 * @param {boolean} [required]
 * @returns {import("./types.js").AgentPayloadField}
 */
function createPayloadField(name, type, description, required = true) {
    return {
        name,
        type,
        description,
        required,
    };
}

const ATTRIBUTE_FIELD = createPayloadField(
    "attribute",
    "AttributeIdentifier",
    "The sample attribute the action operates on."
);

const VALUES_FIELD = createPayloadField(
    "values",
    "any[]",
    "Discrete attribute values used for matching samples."
);

const REMOVE_FIELD = createPayloadField(
    "remove",
    "boolean",
    "If true, matching samples are removed instead of retained.",
    false
);

const OPERATOR_FIELD = createPayloadField(
    "operator",
    '"lt" | "lte" | "eq" | "gte" | "gt"',
    "Comparison operator applied to the attribute value."
);

const OPERAND_FIELD = createPayloadField(
    "operand",
    "number",
    "Numeric threshold used in the comparison."
);

const THRESHOLDS_FIELD = createPayloadField(
    "thresholds",
    'Array<{ operator: "lt" | "lte"; operand: number }>',
    "Threshold definitions applied in ascending order to build groups."
);

const N_FIELD = createPayloadField(
    "n",
    "number",
    "Number of leading categories to retain."
);

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
 * @type {Record<import("./types.js").AgentActionType, {
 *   actionCreator: (payload: any) => import("@reduxjs/toolkit").PayloadAction<any>,
 *   description: string,
 *   payloadType: string,
 *   payloadDescription: string,
 *   payloadFields: import("./types.js").AgentPayloadField[],
 *   examplePayload: Record<string, any>,
 *   validatePayload: (payload: Record<string, any>) => string[],
 * }>}
 */
export const actionCatalog = {
    sortBy: {
        actionCreator: sampleSlice.actions.sortBy,
        description: "Sort samples by an attribute.",
        payloadType: "SortBy",
        payloadDescription:
            "Payload for sorting samples by a single sample attribute.",
        payloadFields: [ATTRIBUTE_FIELD],
        examplePayload: {
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "age" },
        },
        validatePayload: validateAttributePayload,
    },

    filterByNominal: {
        actionCreator: sampleSlice.actions.filterByNominal,
        description: "Retain or remove samples by discrete attribute values.",
        payloadType: "FilterByNominal",
        payloadDescription:
            "Payload for matching discrete attribute values and either retaining or removing matching samples.",
        payloadFields: [ATTRIBUTE_FIELD, VALUES_FIELD, REMOVE_FIELD],
        examplePayload: {
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "diagnosis" },
            values: ["AML"],
        },
        validatePayload: (payload) => {
            const errors = validateAttributePayload(payload);
            if (!Array.isArray(payload.values)) {
                errors.push("payload.values must be an array.");
            }
            return errors;
        },
    },

    filterByQuantitative: {
        actionCreator: sampleSlice.actions.filterByQuantitative,
        description: "Retain samples using a numeric comparison.",
        payloadType: "FilterByQuantitative",
        payloadDescription:
            "Payload for filtering samples by comparing a quantitative attribute against a numeric operand.",
        payloadFields: [ATTRIBUTE_FIELD, OPERATOR_FIELD, OPERAND_FIELD],
        examplePayload: {
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "purity" },
            operator: "gte",
            operand: 0.6,
        },
        validatePayload: (payload) => {
            const errors = validateAttributePayload(payload);
            if (!VALID_QUANTITATIVE_OPERATORS.has(payload.operator)) {
                errors.push(
                    "payload.operator must be one of lt, lte, eq, gte, gt."
                );
            }
            if (
                typeof payload.operand !== "number" ||
                !isFinite(payload.operand)
            ) {
                errors.push("payload.operand must be a finite number.");
            }
            return errors;
        },
    },

    groupByNominal: {
        actionCreator: sampleSlice.actions.groupByNominal,
        description: "Group samples by a nominal attribute.",
        payloadType: "GroupByNominal",
        payloadDescription:
            "Payload for grouping samples by the distinct values of a nominal attribute.",
        payloadFields: [ATTRIBUTE_FIELD],
        examplePayload: {
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "subtype" },
        },
        validatePayload: validateAttributePayload,
    },

    groupToQuartiles: {
        actionCreator: sampleSlice.actions.groupToQuartiles,
        description:
            "Group samples by quartile bins of a quantitative attribute.",
        payloadType: "GroupToQuartiles",
        payloadDescription:
            "Payload for grouping samples into quartiles using a quantitative attribute.",
        payloadFields: [ATTRIBUTE_FIELD],
        examplePayload: {
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "age" },
        },
        validatePayload: validateAttributePayload,
    },

    groupByThresholds: {
        actionCreator: sampleSlice.actions.groupByThresholds,
        description:
            "Group samples by explicit thresholds of a quantitative attribute.",
        payloadType: "GroupByThresholds",
        payloadDescription:
            "Payload for grouping samples by applying explicit quantitative thresholds to an attribute.",
        payloadFields: [ATTRIBUTE_FIELD, THRESHOLDS_FIELD],
        examplePayload: {
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "age" },
            thresholds: [
                { operator: "lt", operand: 30 },
                { operator: "lt", operand: 50 },
                { operator: "lte", operand: 70 },
            ],
        },
        validatePayload: validateThresholdPayload,
    },

    retainFirstNCategories: {
        actionCreator: sampleSlice.actions.retainFirstNCategories,
        description: "Retain only the first N categories of an attribute.",
        payloadType: "RetainFirstNCategories",
        payloadDescription:
            "Payload for retaining samples from the first N categories of an attribute.",
        payloadFields: [ATTRIBUTE_FIELD, N_FIELD],
        examplePayload: {
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "subtype" },
            n: 3,
        },
        validatePayload: (payload) => {
            const errors = validateAttributePayload(payload);
            if (!Number.isInteger(payload.n) || payload.n <= 0) {
                errors.push("payload.n must be a positive integer.");
            }
            return errors;
        },
    },
};

/**
 * @returns {import("./types.js").AgentActionCatalogEntry[]}
 */
export function listAgentActions() {
    return Object.entries(actionCatalog).map(([actionType, entry]) => ({
        actionType: /** @type {import("./types.js").AgentActionType} */ (
            actionType
        ),
        description: entry.description,
        payloadType: entry.payloadType,
        payloadDescription: entry.payloadDescription,
        payloadFields: entry.payloadFields,
        examplePayload: entry.examplePayload,
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
