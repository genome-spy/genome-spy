import {
    count,
    max,
    mean,
    median,
    min,
    quantile,
    sum,
    variance,
} from "d3-array";

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
    median,
    q3: (arr, accessor) => quantile(arr, 0.75, accessor),
    variance,
};

export default AGGREGATE_OPS;
