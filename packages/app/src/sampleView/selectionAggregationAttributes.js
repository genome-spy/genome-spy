/**
 * Builds the canonical aggregated attribute identifier for an interval
 * selection.
 *
 * @param {{
 *   viewSelector: import("./sampleViewTypes.js").ViewSelector;
 *   field: import("@genome-spy/core/spec/channel.js").Field;
 *   selectionSelector: { scope: string[]; param: string };
 *   aggregation: import("./types.js").AggregationOp;
 * }} params
 * @returns {import("./types.js").AttributeIdentifier}
 */
export function buildSelectionAggregationAttributeIdentifier({
    viewSelector,
    field,
    selectionSelector,
    aggregation,
}) {
    return {
        type: "VALUE_AT_LOCUS",
        specifier: {
            view: viewSelector,
            field,
            interval: {
                type: "selection",
                selector: selectionSelector,
            },
            aggregation: {
                op: aggregation,
            },
        },
    };
}
