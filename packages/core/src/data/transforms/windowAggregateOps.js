import { bisectLeft, quantileSorted } from "d3-array";

/** @typedef {import("../flowNode.js").Datum} Datum */

export const WINDOW_AGGREGATE_OPS = new Set([
    "count",
    "valid",
    "sum",
    "min",
    "max",
    "mean",
    "q1",
    "median",
    "q3",
    "variance",
]);

const ORDERED_OPS = new Set(["min", "max", "q1", "median", "q3"]);
const MOMENT_OPS = new Set(["mean", "variance"]);

/**
 * @typedef {{ op: string, resultIndex: number }} AggregateResult
 */

/**
 * @typedef {{ starts: number[], stops: number[] }} AggregateBounds
 */

/**
 * @typedef {(rows: Datum[], bounds: AggregateBounds, results: any[][]) => void} AggregatePartitionEvaluator
 */

/** @typedef {(state: WindowAggregateState) => any} AggregateValueReader */

/**
 * Prepares the sliding-state loop once per aggregate field group. Result
 * readers are selected during setup, not for every output value.
 *
 * @param {(datum: Datum) => any} accessor
 * @param {AggregateResult[]} results
 */
export function createAggregatePartitionEvaluator(accessor, results) {
    const ops = results.map(({ op }) => op);
    const resultIndices = results.map(({ resultIndex }) => resultIndex);
    const readers = results.map(({ op }) => createAggregateValueReader(op));

    return /** @type {AggregatePartitionEvaluator} */ (
        (rows, bounds, output) => {
            const state = new WindowAggregateState(accessor, ops);
            const resultArrays = resultIndices.map((index) => output[index]);
            const starts = bounds.starts;
            const stops = bounds.stops;
            let start = 0;
            let stop = 0;

            for (let index = 0; index < rows.length; index++) {
                const nextStart = starts[index];
                const nextStop = stops[index];
                while (start < nextStart) {
                    state.remove(rows[start++]);
                }
                while (start > nextStart) {
                    state.add(rows[--start]);
                }
                while (stop < nextStop) {
                    state.add(rows[stop++]);
                }
                while (stop > nextStop) {
                    state.remove(rows[--stop]);
                }

                for (let i = 0; i < readers.length; i++) {
                    resultArrays[i][index] = readers[i](state);
                }
            }
        }
    );
}

/**
 * @param {string} op
 * @returns {AggregateValueReader}
 */
function createAggregateValueReader(op) {
    switch (op) {
        case "valid":
            return (state) => state.valid;
        case "sum":
            return (state) => (state.valid ? state.sum : undefined);
        case "min":
            return (state) => (state.valid ? state.values[0] : undefined);
        case "max":
            return (state) =>
                state.valid ? state.values[state.values.length - 1] : undefined;
        case "mean":
            return (state) => (state.valid ? state.mean : undefined);
        case "q1":
            return (state) => (state.valid ? state.q1() : undefined);
        case "median":
            return (state) => (state.valid ? state.median() : undefined);
        case "q3":
            return (state) => (state.valid ? state.q3() : undefined);
        case "variance":
            return (state) =>
                state.valid > 1 ? state.m2 / (state.valid - 1) : undefined;
        default:
            throw new Error(`Unsupported aggregate window operation: ${op}`);
    }
}

/**
 * Maintains aggregate state while a window frame moves through one partition.
 * Rows enter and leave each state once per boundary movement, avoiding a
 * full-frame scan for every output row.
 */
export class WindowAggregateState {
    /** @type {(datum: Datum) => any} */
    accessor;

    /** @type {boolean} */
    needsSum;

    /** @type {boolean} */
    needsMoments;

    /** @type {boolean} */
    needsOrderedValues;

    /** @type {number} */
    valid;

    /** @type {number} */
    sum;

    /** @type {number} */
    mean;

    /** @type {number} */
    m2;

    // TODO: Use an ordered multiset if large moving frames make splice-based
    // updates a bottleneck.
    /** @type {number[]} */
    values;

    /**
     * @param {(datum: Datum) => any} accessor
     * @param {string[]} ops
     */
    constructor(accessor, ops) {
        this.accessor = accessor;
        this.needsSum = ops.includes("sum");
        this.needsMoments = ops.some((op) => MOMENT_OPS.has(op));
        this.needsOrderedValues = ops.some((op) => ORDERED_OPS.has(op));
        this.reset();
    }

    reset() {
        this.valid = 0;
        this.sum = 0;
        this.mean = 0;
        this.m2 = 0;
        this.values = [];
    }

    /** @param {Datum} datum */
    add(datum) {
        const value = this.accessor(datum);
        if (value == null || value === "" || Number.isNaN(value)) {
            return;
        }

        this.valid += 1;
        if (!this.needsSum && !this.needsMoments && !this.needsOrderedValues) {
            return;
        }

        const numericValue = +value;
        if (this.needsSum) {
            this.sum += numericValue;
        }
        if (this.needsMoments) {
            const delta = numericValue - this.mean;
            this.mean += delta / this.valid;
            this.m2 += delta * (numericValue - this.mean);
        }
        if (this.needsOrderedValues) {
            this.values.splice(
                bisectLeft(this.values, numericValue),
                0,
                numericValue
            );
        }
    }

    /** @param {Datum} datum */
    remove(datum) {
        const value = this.accessor(datum);
        if (value == null || value === "" || Number.isNaN(value)) {
            return;
        }

        const oldCount = this.valid;
        this.valid -= 1;
        if (!this.needsSum && !this.needsMoments && !this.needsOrderedValues) {
            return;
        }

        const numericValue = +value;
        if (this.needsSum) {
            this.sum -= numericValue;
        }
        if (this.needsMoments) {
            if (this.valid) {
                const oldMean = this.mean;
                this.mean = (oldMean * oldCount - numericValue) / this.valid;
                this.m2 -=
                    (numericValue - oldMean) * (numericValue - this.mean);
            } else {
                this.mean = 0;
                this.m2 = 0;
            }
        }
        if (this.needsOrderedValues) {
            const index = bisectLeft(this.values, numericValue);
            if (this.values[index] !== numericValue) {
                throw new Error("Window aggregate state is inconsistent.");
            }
            this.values.splice(index, 1);
        }
    }

    q1() {
        return quantileSorted(this.values, 0.25);
    }

    median() {
        return quantileSorted(this.values, 0.5);
    }

    q3() {
        return quantileSorted(this.values, 0.75);
    }
}
