/**
 * Window-only operations adapted from Vega's window transform. They operate
 * on one sorted partition at a time and intentionally do not manage data-flow
 * state.
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
 * @typedef {object} WindowContext
 * @prop {import("../flowNode.js").Datum[]} rows
 * @prop {number} index
 * @prop {number} start
 * @prop {number} stop
 * @prop {number} peerStart
 * @prop {number} peerStop
 */

/**
 * @param {import("../../spec/transform.js").WindowOnlyOp} op
 * @param {((datum: import("../flowNode.js").Datum) => any) | undefined} accessor
 * @param {number | null | undefined} parameter
 */
export function createWindowOperation(op, accessor, parameter) {
    /** @type {number} */
    let denseRank;
    /** @type {any} */
    let previous;
    /** @type {number} */
    let nextIndex;
    /** @type {any} */
    let nextValue;

    const offset = Number(parameter) || 1;

    return {
        initialize() {
            denseRank = 0;
            previous = null;
            nextIndex = -1;
            nextValue = null;
        },

        /** @param {WindowContext} context */
        evaluate(context) {
            const { rows, index, start, stop } = context;

            switch (op) {
                case "row_number":
                    return index + 1;

                case "rank":
                    return context.peerStart + 1;

                case "dense_rank":
                    if (context.peerStart == index) {
                        denseRank += 1;
                    }
                    return denseRank;

                case "percent_rank":
                    return context.peerStart / (rows.length - 1);

                case "cume_dist":
                    return context.peerStop / rows.length;

                case "ntile":
                    return Math.ceil(
                        ((parameter ?? 0) * context.peerStop) / rows.length
                    );

                case "lag": {
                    const target = index - offset;
                    return target >= 0 ? accessor(rows[target]) : null;
                }

                case "lead": {
                    const target = index + offset;
                    return target < rows.length ? accessor(rows[target]) : null;
                }

                case "first_value":
                    return start < stop ? accessor(rows[start]) : null;

                case "last_value":
                    return start < stop ? accessor(rows[stop - 1]) : null;

                case "nth_value": {
                    const target =
                        start + /** @type {number} */ (parameter) - 1;
                    return target < stop ? accessor(rows[target]) : null;
                }

                case "prev_value": {
                    const value = accessor(rows[index]);
                    if (value != null) {
                        previous = value;
                    }
                    return previous;
                }

                case "next_value": {
                    if (index > nextIndex) {
                        nextIndex = index;
                        while (
                            nextIndex < rows.length &&
                            (nextValue = accessor(rows[nextIndex])) == null
                        ) {
                            nextIndex += 1;
                        }
                        if (nextIndex == rows.length) {
                            nextValue = null;
                        }
                    }
                    return nextValue;
                }
            }
        },
    };
}
