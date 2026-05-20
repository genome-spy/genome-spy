import {
    buildSelectionAggregationAttributeIdentifier,
    formatAggregationExpression,
} from "@genome-spy/app/agentShared";
import { ToolCallRejectionError } from "./agentToolErrors.js";

/**
 * Resolves a selection-aggregation candidate into an `AttributeIdentifier`
 * for intent actions, plus a short preview.
 *
 * @param {import("./types.js").AgentVolatileContext} volatileContext
 * @param {string} candidateId
 * @param {import("@genome-spy/app/agentShared").AggregationOp} aggregation
 * @param {import("@genome-spy/app/agentShared").FeatureFilter} [featureFilter]
 * @returns {import("./types.js").SelectionAggregationResolution}
 */
export function buildSelectionAggregationAttribute(
    volatileContext,
    candidateId,
    aggregation,
    featureFilter
) {
    const candidate = volatileContext.selectionAggregation.fields.find(
        (field) => field.candidateId === candidateId
    );
    if (!candidate) {
        throw new ToolCallRejectionError(
            "Unknown selection aggregation candidate: " +
                candidateId +
                ". Use an exact candidateId from selectionAggregation.fields."
        );
    }

    if (!candidate.viewSelector) {
        throw new ToolCallRejectionError(
            "Selection aggregation candidate is missing a view selector."
        );
    }

    if (!candidate.selectionSelector) {
        throw new ToolCallRejectionError(
            "Selection aggregation candidate is missing a selection selector."
        );
    }

    if (!candidate.supportedAggregations.includes(aggregation)) {
        throw new ToolCallRejectionError(
            "Aggregation " +
                aggregation +
                " is not supported for candidate " +
                candidateId +
                "."
        );
    }

    if (featureFilter) {
        validateFeatureFilter(candidate, featureFilter);
    }

    const attribute = buildSelectionAggregationAttributeIdentifier({
        viewSelector: candidate.viewSelector,
        field: candidate.field,
        selectionSelector: candidate.selectionSelector,
        aggregation,
        featureFilter,
    });

    return {
        kind: "selection_aggregation_resolution",
        candidateId,
        aggregation,
        viewSelector: candidate.viewSelector,
        selectionSelector: candidate.selectionSelector,
        field: candidate.field,
        attribute,
        title: formatAggregationExpression(
            aggregation,
            candidate.field,
            featureFilter
        ),
        description:
            "Aggregated " +
            candidate.field +
            " values over the " +
            formatParamSelector(candidate.selectionSelector) +
            " selection" +
            (featureFilter ? " after filtering features" : ""),
    };
}

/**
 * @param {import("./types.js").AgentViewFieldSummary} candidate
 * @param {import("@genome-spy/app/agentShared").FeatureFilter} filter
 */
function validateFeatureFilter(candidate, filter) {
    const field = candidate.filterableFields.find(
        (filterField) => filterField.field === filter.field
    );
    if (!field) {
        throw new ToolCallRejectionError(
            "Feature filter field " +
                filter.field +
                " is not listed in filterableFields for candidate " +
                candidate.candidateId +
                "."
        );
    }

    if (field.dataType === "quantitative" && filter.operator === "in") {
        throw new ToolCallRejectionError(
            "Use a comparison operator for quantitative feature filter field " +
                filter.field +
                "."
        );
    }

    if (
        field.dataType !== "quantitative" &&
        filter.operator !== "eq" &&
        filter.operator !== "in"
    ) {
        throw new ToolCallRejectionError(
            "Use operator 'in' or 'eq' for categorical feature filter field " +
                filter.field +
                "."
        );
    }
}

/**
 * @param {import("@genome-spy/core/view/viewSelectors.js").ParamSelector} selector
 * @returns {string}
 */
function formatParamSelector(selector) {
    return selector.scope.length > 0
        ? `${selector.scope.join("/")}:${selector.param}`
        : selector.param;
}
