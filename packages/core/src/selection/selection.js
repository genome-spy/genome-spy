import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";

/**
 * @param {import("../data/flowNode.js").Datum} datum
 * @returns {import("../types/selectionTypes.js").SinglePointSelection}
 */
export function createSinglePointSelection(datum) {
    return {
        type: "single",
        datum,
        uniqueId: datum?.[UNIQUE_ID_KEY],
    };
}

/**
 * @param {import("../types/selectionTypes.js").Selection} selection
 * @param {import("../data/flowNode.js").Datum} datum
 * @param {boolean} [empty] evaluate to true if the selection is empty
 */
export function selectionTest(selection, datum, empty = true) {
    if (!selection || !datum) {
        return false;
    }

    if (isSinglePointSelection(selection)) {
        return selection.uniqueId == null
            ? empty
            : selection.uniqueId === datum[UNIQUE_ID_KEY];
    } else if (isMultiPointSelection(selection)) {
        return selection.uniqueIds.size == 0
            ? empty
            : selection.uniqueIds.has(datum[UNIQUE_ID_KEY]);
    } else {
        throw new Error("Not a selection: " + JSON.stringify(selection));
    }
}

/**
 * @param {import("../types/selectionTypes.js").Selection} selection
 * @returns {selection is import("../types/selectionTypes.js").RangeSelection}
 */
export function isRangeSelection(selection) {
    return selection.type === "range";
}

/**
 * @param {import("../types/selectionTypes.js").Selection} selection
 * @returns {selection is import("../types/selectionTypes.js").SinglePointSelection}
 */
export function isSinglePointSelection(selection) {
    return selection.type === "single";
}

/**
 * @param {import("../types/selectionTypes.js").Selection} selection
 * @returns {selection is import("../types/selectionTypes.js").MultiPointSelection}
 */
export function isMultiPointSelection(selection) {
    return selection.type === "multi";
}

/**
 * @param {import("../types/selectionTypes.js").Selection} selection
 * @returns {selection is import("../types/selectionTypes.js").ProjectedSelection}
 */
export function isProjectedSelection(selection) {
    return selection.type === "projected";
}
