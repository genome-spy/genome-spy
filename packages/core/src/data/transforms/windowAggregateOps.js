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

/**
 * Maintains aggregate state while a window frame moves through one partition.
 * Rows enter and leave each state once per boundary movement, avoiding a
 * full-frame scan for every output row.
 */
export class WindowAggregateState {
    /** @type {((datum: Datum) => any) | undefined} */
    accessor;

    /** @type {boolean} */
    needsOrderedValues;

    /** @type {number} */
    count;

    /** @type {number} */
    valid;

    /** @type {number} */
    sum;

    /** @type {number} */
    mean;

    /** @type {number} */
    m2;

    /** @type {number[] | null} */
    values;

    /**
     * @param {((datum: Datum) => any) | undefined} accessor
     * @param {string[]} ops
     */
    constructor(accessor, ops) {
        this.accessor = accessor;
        this.needsOrderedValues = ops.some((op) => ORDERED_OPS.has(op));
        this.reset();
    }

    reset() {
        this.count = 0;
        this.valid = 0;
        this.sum = 0;
        this.mean = 0;
        this.m2 = 0;
        this.values = this.needsOrderedValues ? [] : null;
    }

    /** @param {Datum} datum */
    add(datum) {
        this.count += 1;
        this.#addValue(this.accessor ? this.accessor(datum) : undefined);
    }

    /** @param {Datum} datum */
    remove(datum) {
        this.count -= 1;
        this.#removeValue(this.accessor ? this.accessor(datum) : undefined);
    }

    /** @param {string} op */
    value(op) {
        switch (op) {
            case "count":
                return this.count;
            case "valid":
                return this.valid;
            case "sum":
                return this.valid ? this.sum : undefined;
            case "min":
                return this.valid ? this.values[0] : undefined;
            case "max":
                return this.valid
                    ? this.values[this.values.length - 1]
                    : undefined;
            case "mean":
                return this.valid ? this.mean : undefined;
            case "q1":
                return this.valid
                    ? quantileSorted(this.values, 0.25)
                    : undefined;
            case "median":
                return this.valid
                    ? quantileSorted(this.values, 0.5)
                    : undefined;
            case "q3":
                return this.valid
                    ? quantileSorted(this.values, 0.75)
                    : undefined;
            case "variance":
                return this.valid > 1 ? this.m2 / (this.valid - 1) : undefined;
        }
    }

    /** @param {any} value */
    #addValue(value) {
        if (value == null || value === "" || Number.isNaN(value)) {
            return;
        }

        const numericValue = +value;
        this.valid += 1;
        this.sum += numericValue;

        const delta = numericValue - this.mean;
        this.mean += delta / this.valid;
        this.m2 += delta * (numericValue - this.mean);

        if (this.values) {
            this.values.splice(
                bisectLeft(this.values, numericValue),
                0,
                numericValue
            );
        }
    }

    /** @param {any} value */
    #removeValue(value) {
        if (value == null || value === "" || Number.isNaN(value)) {
            return;
        }

        const numericValue = +value;
        const oldCount = this.valid;
        this.valid -= 1;
        this.sum -= numericValue;

        if (this.valid) {
            const oldMean = this.mean;
            this.mean = (oldMean * oldCount - numericValue) / this.valid;
            this.m2 -= (numericValue - oldMean) * (numericValue - this.mean);
        } else {
            this.mean = 0;
            this.m2 = 0;
        }

        if (this.values) {
            const index = bisectLeft(this.values, numericValue);
            if (this.values[index] !== numericValue) {
                throw new Error("Window aggregate state is inconsistent.");
            }
            this.values.splice(index, 1);
        }
    }
}
