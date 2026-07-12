/**
 * Window-only operations adapted from Vega's window transform. The operation
 * is selected once while the transform is constructed; every evaluator then
 * runs a specialized loop for one complete partition.
 */

export const WINDOW_ONLY_OPS = new Set([
    "row_number",
    "rank",
    "dense_rank",
    "percent_rank",
    "cume_dist",
    "ntile",
    "lag",
    "lead",
    "first_value",
    "last_value",
    "nth_value",
    "prev_value",
    "next_value",
]);

export const FIELDLESS_WINDOW_OPS = new Set([
    "row_number",
    "rank",
    "dense_rank",
    "percent_rank",
    "cume_dist",
    "ntile",
]);

/**
 * @typedef {object} PartitionBounds
 * @prop {number[]} starts
 * @prop {number[]} stops
 * @prop {number[]} peerStarts
 * @prop {number[]} peerStops
 */

/**
 * @typedef {(rows: import("../flowNode.js").Datum[], bounds: PartitionBounds, results: any[]) => void} PartitionEvaluator
 */

/**
 * @param {import("../../spec/transform.js").WindowOnlyOp} op
 * @param {((datum: import("../flowNode.js").Datum) => any) | undefined} accessor
 * @param {number | null | undefined} parameter
 * @returns {PartitionEvaluator}
 */
export function createWindowOperation(op, accessor, parameter) {
    const get = /** @type {(datum: import("../flowNode.js").Datum) => any} */ (
        accessor
    );

    switch (op) {
        case "row_number":
            return (rows, _bounds, results) => {
                for (let i = 0; i < rows.length; i++) {
                    results[i] = i + 1;
                }
            };

        case "rank":
            return (rows, bounds, results) => {
                const peerStarts = bounds.peerStarts;
                for (let i = 0; i < rows.length; i++) {
                    results[i] = peerStarts[i] + 1;
                }
            };

        case "dense_rank":
            return (rows, bounds, results) => {
                const peerStarts = bounds.peerStarts;
                let rank = 0;
                for (let i = 0; i < rows.length; i++) {
                    if (peerStarts[i] == i) {
                        rank += 1;
                    }
                    results[i] = rank;
                }
            };

        case "percent_rank":
            return (rows, bounds, results) => {
                const peerStarts = bounds.peerStarts;
                const denominator = rows.length - 1;
                for (let i = 0; i < rows.length; i++) {
                    results[i] = peerStarts[i] / denominator;
                }
            };

        case "cume_dist":
            return (rows, bounds, results) => {
                const peerStops = bounds.peerStops;
                const denominator = rows.length;
                for (let i = 0; i < rows.length; i++) {
                    results[i] = peerStops[i] / denominator;
                }
            };

        case "ntile": {
            const tiles = /** @type {number} */ (parameter);
            return (rows, bounds, results) => {
                const peerStops = bounds.peerStops;
                const denominator = rows.length;
                for (let i = 0; i < rows.length; i++) {
                    results[i] = Math.ceil(
                        (tiles * peerStops[i]) / denominator
                    );
                }
            };
        }

        case "lag": {
            const offset = Number(parameter) || 1;
            return (rows, _bounds, results) => {
                for (let i = 0; i < rows.length; i++) {
                    results[i] = i >= offset ? get(rows[i - offset]) : null;
                }
            };
        }

        case "lead": {
            const offset = Number(parameter) || 1;
            return (rows, _bounds, results) => {
                const limit = rows.length - offset;
                for (let i = 0; i < rows.length; i++) {
                    results[i] = i < limit ? get(rows[i + offset]) : null;
                }
            };
        }

        case "first_value":
            return (rows, bounds, results) => {
                const starts = bounds.starts;
                const stops = bounds.stops;
                for (let i = 0; i < rows.length; i++) {
                    results[i] =
                        starts[i] < stops[i] ? get(rows[starts[i]]) : null;
                }
            };

        case "last_value":
            return (rows, bounds, results) => {
                const starts = bounds.starts;
                const stops = bounds.stops;
                for (let i = 0; i < rows.length; i++) {
                    results[i] =
                        starts[i] < stops[i] ? get(rows[stops[i] - 1]) : null;
                }
            };

        case "nth_value": {
            const nth = /** @type {number} */ (parameter);
            return (rows, bounds, results) => {
                const starts = bounds.starts;
                const stops = bounds.stops;
                for (let i = 0; i < rows.length; i++) {
                    const target = starts[i] + nth - 1;
                    results[i] = target < stops[i] ? get(rows[target]) : null;
                }
            };
        }

        case "prev_value":
            return (rows, _bounds, results) => {
                let previous = null;
                for (let i = 0; i < rows.length; i++) {
                    const value = get(rows[i]);
                    if (value != null) {
                        previous = value;
                    }
                    results[i] = previous;
                }
            };

        case "next_value":
            return (rows, _bounds, results) => {
                let nextIndex = -1;
                let nextValue = null;
                for (let i = 0; i < rows.length; i++) {
                    if (i > nextIndex) {
                        nextIndex = i;
                        while (
                            nextIndex < rows.length &&
                            (nextValue = get(rows[nextIndex])) == null
                        ) {
                            nextIndex += 1;
                        }
                        if (nextIndex == rows.length) {
                            nextValue = null;
                        }
                    }
                    results[i] = nextValue;
                }
            };
    }
}
