/**
 * Creates a runtime interval selection value for use with parameter APIs.
 *
 * @param {Partial<Record<import("../spec/parameter.js").IntervalSelectionChannel, [number, number] | null>>} intervals
 * @returns {import("../types/selectionTypes.js").IntervalSelection}
 */
export function intervalSelection(intervals) {
    return {
        type: "interval",
        intervals: { ...intervals },
    };
}
