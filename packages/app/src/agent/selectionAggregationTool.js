import { formatAggregationExpression } from "../sampleView/attributeAggregation/aggregationOps.js";
import { buildSelectionAggregationAttributeIdentifier } from "../sampleView/selectionAggregationAttributes.js";

/**
 * Resolves a selection-aggregation candidate into an `AttributeIdentifier`
 * for intent actions, plus a short preview.
 *
 * @param {import("./types.js").AgentVolatileContext} volatileContext
 * @param {string} candidateId
 * @param {import("../sampleView/types.js").AggregationOp} aggregation
 * @returns {import("./types.js").SelectionAggregationResolution}
 */
export function buildSelectionAggregationAttribute(
    volatileContext,
    candidateId,
    aggregation
) {
    const candidate = volatileContext.selectionAggregation.fields.find(
        (field) => field.candidateId === candidateId
    );
    if (!candidate) {
        throw new Error(
            "Unknown selection aggregation candidate: " + candidateId + "."
        );
    }

    if (!candidate.viewSelector) {
        throw new Error(
            "Selection aggregation candidate is missing a view selector."
        );
    }

    if (!candidate.selectionSelector) {
        throw new Error(
            "Selection aggregation candidate is missing a selection selector."
        );
    }

    if (!candidate.supportedAggregations.includes(aggregation)) {
        throw new Error(
            "Aggregation " +
                aggregation +
                " is not supported for candidate " +
                candidateId +
                "."
        );
    }

    const attribute = buildSelectionAggregationAttributeIdentifier({
        viewSelector: candidate.viewSelector,
        field: candidate.field,
        selectionSelector: candidate.selectionSelector,
        aggregation,
    });

    return {
        kind: "selection_aggregation_resolution",
        candidateId,
        aggregation,
        viewSelector: candidate.viewSelector,
        selectionSelector: candidate.selectionSelector,
        field: candidate.field,
        attribute,
        title: formatAggregationExpression(aggregation, candidate.field),
        description:
            "Aggregated " +
            candidate.field +
            " values over the " +
            formatParamSelector(candidate.selectionSelector) +
            " selection",
    };
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
