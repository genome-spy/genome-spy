import { count, max, mean, min, quickselect, sum, variance } from "d3-array";

/**
 * Select adjacent order statistics without passing the rows through an
 * iterator. Coercion and linear interpolation match d3-array's quantile.
 *
 * @param {any[]} rows
 * @param {number} p An interior quantile (0 < p < 1)
 * @param {(row: any) => any} [accessor]
 */
function quantile(rows, p, accessor = (row) => row) {
    const values = new Float64Array(rows.length);
    let length = 0;
    for (const row of rows) {
        const raw = accessor(row);
        if (raw != null) {
            const value = +raw;
            if (!Number.isNaN(value)) {
                values[length++] = value;
            }
        }
    }

    if (length <= 1) {
        return length === 1 ? values[0] : undefined;
    }

    const position = (length - 1) * p;
    const lowerIndex = Math.floor(position);
    quickselect(values, lowerIndex, 0, length - 1);

    const lower = values[lowerIndex];
    let upper = values[lowerIndex + 1];
    for (let i = lowerIndex + 2; i < length; i++) {
        if (values[i] < upper) {
            upper = values[i];
        }
    }
    return lower + (upper - lower) * (position - lowerIndex);
}

/**
 * @type {Record<import("../../spec/transform.js").AggregateOp, (arr: any[], accessor?: (datum: any) => number) => number>}
 */
const AGGREGATE_OPS = {
    count: (arr) => arr.length,
    valid: count,
    sum,
    min,
    max,
    mean,
    q1: (arr, accessor) => quantile(arr, 0.25, accessor),
    median: (arr, accessor) => quantile(arr, 0.5, accessor),
    q3: (arr, accessor) => quantile(arr, 0.75, accessor),
    variance,
};

export default AGGREGATE_OPS;
