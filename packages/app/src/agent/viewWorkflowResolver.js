import { getViewWorkflowDefinition } from "./viewWorkflowCatalog.js";
import { getViewWorkflowContext } from "./viewWorkflowContext.js";

/**
 * @param {import("../app.js").default} app
 * @param {import("./types.js").ViewWorkflowRequest} workflowRequest
 * @returns {import("./types.js").ResolverResult<import("./types.js").ResolvedViewWorkflow>}
 */
export function resolveViewWorkflow(app, workflowRequest) {
    const definition = getViewWorkflowDefinition(workflowRequest.workflowType);
    if (!definition) {
        return {
            status: "error",
            message:
                "Unsupported view workflow type: " +
                workflowRequest.workflowType +
                ".",
        };
    }

    const context = getViewWorkflowContext(app);

    const selection = resolveSelection(context, workflowRequest.selectionId);
    if ("status" in selection) {
        return selection;
    }

    const field = resolveField(context, selection.id, workflowRequest.fieldId);
    if ("status" in field) {
        return field;
    }

    const aggregation = resolveAggregation(field, workflowRequest.aggregation);
    if (typeof aggregation !== "string") {
        return aggregation;
    }

    return {
        status: "resolved",
        value: {
            workflowType: workflowRequest.workflowType,
            selection,
            field,
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
                          fieldId: field.id,
                          selectionSuffix: selection.nameSuffix,
                      })
                    : workflowRequest.name,
            groupPath: workflowRequest.groupPath,
            scale: workflowRequest.scale,
        },
    };
}

/**
 * @param {import("./types.js").AgentViewWorkflowContext} context
 * @param {string | undefined} selectionId
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
            return match;
        }
    }

    if (context.selections.length === 1) {
        return context.selections[0];
    }

    return {
        status: "needs_clarification",
        request: {
            workflowKind: "view_workflow",
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
 * @param {import("./types.js").AgentViewWorkflowContext} context
 * @param {string} selectionId
 * @param {string | undefined} fieldId
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
            return match;
        }
    }

    if (fields.length === 1) {
        return fields[0];
    }

    return {
        status: "needs_clarification",
        request: {
            workflowKind: "view_workflow",
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
 * @param {import("./types.js").AgentViewFieldSummary} field
 * @param {string | undefined} aggregation
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
            workflowKind: "view_workflow",
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
 * @param {{ aggregation: string, fieldId: string, selectionSuffix: string }} options
 */
function createDerivedMetadataName(options) {
    const parsedField = JSON.parse(options.fieldId);
    const normalizedBase = sanitizeName(
        `${options.aggregation}_${parsedField.field}`
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
