import { count, max, mean, median, min, sum, variance } from "d3-array";

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
    median,
    variance,
};

export default AGGREGATE_OPS;
