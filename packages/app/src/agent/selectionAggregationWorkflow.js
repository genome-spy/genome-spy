/**
 * @typedef {import("./types.js").AgentSelectionSummary} SelectionSummary
 *
 * @typedef {import("./types.js").AgentViewFieldSummary} FieldSummary
 *
 * @typedef {{
 *     selections: SelectionSummary[];
 *     fields: FieldSummary[];
 * }} SelectionAggregationWorkflowContext
 *
 * @typedef {{
 *     workflowType: "deriveMetadataFromSelection" | "createBoxplotFromSelection";
 *     selectionId?: string;
 *     fieldId?: string;
 *     aggregation?: string;
 *     outputTarget?: "sample_metadata" | "boxplot";
 *     name?: string;
 *     groupPath?: string;
 *     scale?: Record<string, any>;
 * }} SelectionAggregationWorkflowRequest
 *
 * @typedef {{
 *     workflowType: "deriveMetadataFromSelection" | "createBoxplotFromSelection";
 *     selection: SelectionSummary;
 *     field: FieldSummary;
 *     aggregation: string;
 *     outputTarget: "sample_metadata" | "boxplot";
 *     name?: string;
 *     groupPath?: string;
 *     scale?: Record<string, any>;
 * }} ResolvedSelectionAggregationWorkflow
 *
 * @typedef {{
 *     workflowKind: "selection_aggregation";
 *     slot: "selectionId" | "fieldId" | "aggregation";
 *     message: string;
 *     options?: Array<{ value: string; label: string }>;
 *     initialValue: string;
 *     state: Record<string, string>;
 * }} SelectionAggregationClarificationRequest
 *
 * @typedef {{
 *     status: "resolved";
 *     value: SelectionSummary;
 * } | {
 *     status: "needs_clarification";
 *     request: SelectionAggregationClarificationRequest;
 * } | {
 *     status: "error";
 *     message: string;
 * }} SelectionResolutionResult
 *
 * @typedef {{
 *     status: "resolved";
 *     value: FieldSummary;
 * } | {
 *     status: "needs_clarification";
 *     request: SelectionAggregationClarificationRequest;
 * } | {
 *     status: "error";
 *     message: string;
 * }} FieldResolutionResult
 *
 * @typedef {{
 *     status: "needs_clarification";
 *     request: SelectionAggregationClarificationRequest;
 * } | {
 *     status: "error";
 *     message: string;
 * }} AggregationResolutionResult
 *
 * @typedef {{
 *     status: "resolved";
 *     value: ResolvedSelectionAggregationWorkflow;
 * } | {
 *     status: "needs_clarification";
 *     request: SelectionAggregationClarificationRequest;
 * } | {
 *     status: "error";
 *     message: string;
 * }} SelectionAggregationWorkflowResolution
 */

/**
 * Resolves a compact workflow request into a concrete selection aggregation
 * workflow.
 *
 * @param {SelectionAggregationWorkflowContext} context
 * @param {SelectionAggregationWorkflowRequest} workflowRequest
 * @returns {SelectionAggregationWorkflowResolution}
 */
export function resolveSelectionAggregationWorkflow(context, workflowRequest) {
    const selection = resolveSelection(context, workflowRequest.selectionId);
    if (
        selection.status === "error" ||
        selection.status === "needs_clarification"
    ) {
        return selection;
    }
    const resolvedSelection = selection.value;

    const field = resolveField(
        context,
        resolvedSelection.id,
        workflowRequest.fieldId
    );
    if (field.status === "error" || field.status === "needs_clarification") {
        return field;
    }
    const resolvedField = field.value;

    const aggregation = resolveAggregation(
        resolvedField,
        workflowRequest.aggregation
    );
    if (typeof aggregation !== "string") {
        return aggregation;
    }

    return {
        status: "resolved",
        value: {
            workflowType: workflowRequest.workflowType,
            selection: resolvedSelection,
            field: resolvedField,
            aggregation,
            outputTarget:
                workflowRequest.outputTarget ??
                (workflowRequest.workflowType === "createBoxplotFromSelection"
                    ? "boxplot"
                    : "sample_metadata"),
            name:
                workflowRequest.workflowType ===
                    "deriveMetadataFromSelection" && !workflowRequest.name
                    ? createDerivedMetadataName({
                          aggregation,
                          fieldName: resolvedField.field,
                          selectionSuffix: resolvedSelection.nameSuffix,
                      })
                    : workflowRequest.name,
            groupPath: workflowRequest.groupPath,
            scale: workflowRequest.scale,
        },
    };
}

/**
 * @param {SelectionAggregationWorkflowContext} context
 * @param {string | undefined} selectionId
 * @returns {SelectionResolutionResult}
 */
function resolveSelection(context, selectionId) {
    if (context.selections.length === 0) {
        return {
            status: "error",
            message:
                "No active interval selection is available. Create a brush selection first, then try again.",
        };
    }

    if (selectionId) {
        const match = context.selections.find(
            (selection) => selection.id === selectionId
        );
        if (match) {
            return {
                status: "resolved",
                value: match,
            };
        }
    }

    if (context.selections.length === 1) {
        return {
            status: "resolved",
            value: context.selections[0],
        };
    }

    return {
        status: "needs_clarification",
        request: {
            workflowKind: "selection_aggregation",
            slot: "selectionId",
            message:
                "I need to know which active selection to use. Available options: " +
                context.selections
                    .map((selection) => selection.label)
                    .join(", ") +
                ".",
            options: context.selections.map((selection) => ({
                value: selection.id,
                label: selection.label,
            })),
            initialValue: context.selections[0].id,
            state: {},
        },
    };
}

/**
 * @param {SelectionAggregationWorkflowContext} context
 * @param {string} selectionId
 * @param {string | undefined} fieldId
 * @returns {FieldResolutionResult}
 */
function resolveField(context, selectionId, fieldId) {
    const fields = context.fields.filter((field) =>
        field.selectionIds.includes(selectionId)
    );
    if (fields.length === 0) {
        return {
            status: "error",
            message:
                "No aggregatable view fields are available for the selected interval.",
        };
    }

    if (fieldId) {
        const match = fields.find((field) => field.id === fieldId);
        if (match) {
            return {
                status: "resolved",
                value: match,
            };
        }
    }

    if (fields.length === 1) {
        return {
            status: "resolved",
            value: fields[0],
        };
    }

    return {
        status: "needs_clarification",
        request: {
            workflowKind: "selection_aggregation",
            slot: "fieldId",
            message:
                "I need to know which field from the selected visualization to use. Available options: " +
                fields
                    .map((field) => `${field.field} (${field.viewTitle})`)
                    .join(", ") +
                ".",
            options: fields.map((field) => ({
                value: field.id,
                label: `${field.field} (${field.viewTitle})`,
            })),
            initialValue: fields[0].id,
            state: {
                selectionId,
            },
        },
    };
}

/**
 * @param {FieldSummary} field
 * @param {string | undefined} aggregation
 * @returns {string | AggregationResolutionResult}
 */
function resolveAggregation(field, aggregation) {
    if (aggregation && field.supportedAggregations.includes(aggregation)) {
        return aggregation;
    }

    if (field.supportedAggregations.length === 1) {
        return field.supportedAggregations[0];
    }

    return {
        status: "needs_clarification",
        request: {
            workflowKind: "selection_aggregation",
            slot: "aggregation",
            message:
                "I need to know which aggregation to compute for " +
                field.field +
                ". Available options: " +
                field.supportedAggregations.join(", ") +
                ".",
            options: field.supportedAggregations.map((op) => ({
                value: op,
                label: op,
            })),
            initialValue: field.supportedAggregations[0],
            state: {
                fieldId: field.id,
            },
        },
    };
}

/**
 * @param {{ aggregation: string, fieldName: string, selectionSuffix: string }} options
 */
function createDerivedMetadataName(options) {
    const normalizedBase = sanitizeName(
        `${options.aggregation}_${options.fieldName}`
    );
    return appendCompactSuffix(normalizedBase, options.selectionSuffix, 32);
}

/**
 * @param {string} value
 */
function sanitizeName(value) {
    const normalized = value
        .replace(/[^A-Za-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");

    return normalized.length > 0 ? normalized : "derivedMetadata";
}

/**
 * @param {string} base
 * @param {string} suffix
 * @param {number} maxLength
 */
function appendCompactSuffix(base, suffix, maxLength) {
    const combined = `${base}_${suffix}`;
    if (combined.length <= maxLength) {
        return combined;
    }

    const reserved = suffix.length + 1;
    const truncatedBase = base.slice(0, Math.max(1, maxLength - reserved));
    return `${truncatedBase}_${suffix}`;
}
