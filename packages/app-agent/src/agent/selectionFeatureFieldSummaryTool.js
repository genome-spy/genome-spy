import {
    buildCategoricalFieldSummary,
    buildQuantitativeFieldSummary,
} from "@genome-spy/app/agentShared";
import { ToolCallRejectionError } from "./agentToolErrors.js";

/**
 * @typedef {import("./agentToolInputs.d.ts").GetSelectionFeatureFieldSummaryToolInput} GetSelectionFeatureFieldSummaryToolInput
 * @typedef {{
 *     agentApi: Pick<
 *         import("@genome-spy/app/agentApi").AgentApi,
 *         "getSelectionFeatureFieldValues"
 *     >;
 *     getAgentVolatileContext(): import("./types.js").AgentVolatileContext;
 * }} SelectionFeatureFieldSummaryRuntime
 * @typedef {{
 *     text: string;
 *     content?: unknown;
 * }} AgentToolExecutionResult
 */

/**
 * Summarizes one raw feature field inside the selected interval before
 * per-sample aggregation.
 *
 * @param {SelectionFeatureFieldSummaryRuntime} runtime
 * @param {GetSelectionFeatureFieldSummaryToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function getSelectionFeatureFieldSummaryTool(runtime, input) {
    const candidate = runtime
        .getAgentVolatileContext()
        .selectionAggregation.fields.find(
            (field) => field.candidateId === input.candidateId
        );
    if (!candidate) {
        throw new ToolCallRejectionError(
            "Unknown selection aggregation candidate: " +
                input.candidateId +
                ". Use an exact candidateId from selectionAggregation.fields."
        );
    }

    if (!candidate.viewSelector) {
        throw new ToolCallRejectionError(
            "Selection aggregation candidate is missing a view selector."
        );
    }

    const filterField = candidate.filterableFields.find(
        (field) => field.field === input.field
    );
    if (!filterField) {
        throw new ToolCallRejectionError(
            "Field " +
                input.field +
                " is not listed in candidate.filterableFields for " +
                input.candidateId +
                "."
        );
    }

    const values = runtime.agentApi.getSelectionFeatureFieldValues(
        candidate.viewSelector,
        candidate.selectionSelector,
        input.field
    );
    if (!values) {
        throw new ToolCallRejectionError(
            "The requested selection feature field could not be summarized."
        );
    }

    const content = {
        kind: "selection_feature_field_summary",
        candidateId: input.candidateId,
        field: input.field,
        dataType: filterField.dataType,
        valueLevel: "raw_feature",
        grouping: "pooled_across_samples",
        interpretation:
            "Values are raw feature values pooled across samples in the selected interval. Counts describe features, not samples.",
        ...(filterField.description
            ? { description: filterField.description }
            : {}),
        featureCount: values.length,
        ...(filterField.dataType === "quantitative"
            ? buildQuantitativeFieldSummary(values)
            : buildCategoricalFieldSummary(values)),
    };

    return {
        text:
            "Summarized pooled raw feature values for field " +
            input.field +
            " from " +
            values.length +
            " features for selection aggregation candidate " +
            input.candidateId +
            ". Counts describe features, not samples.",
        content,
    };
}
