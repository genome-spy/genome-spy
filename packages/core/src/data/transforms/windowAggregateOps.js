import { bisector, bisectRight, quantileSorted } from "d3-array";

/**
 * Compatibility note: this module follows the aggregate portion of Vega's
 * Window contract. Its sliding-state structure and aggregate semantics are
 * adapted from Vega's WindowState and AggregateOps sources:
 * https://github.com/vega/vega/blob/main/packages/vega-transforms/src/util/WindowState.js
 * https://github.com/vega/vega/blob/main/packages/vega-transforms/src/util/AggregateOps.js
 *
 * The state is purpose-built for GenomeSpy's buffered partitions and supported
 * aggregate-operation subset; it is not Vega's incremental tuple-store code.
 *
 * TODO: Add Vega aggregate operations not yet supported by GenomeSpy:
 * values, missing, product, average, variancep, stdev, stdevp, stderr,
 * distinct, ci0, ci1, argmin, argmax, exponential, and exponentialb.
 */

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

const BLOCK_SIZE = 256;
const BLOCK_SHIFT_THRESHOLD = 4096;

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
 * Prepares an evaluator for the requested frames of an aggregate field group.
 * A whole-partition aggregate requests a single frame.
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
            const resultArrays = resultIndices.map((index) => output[index]);
            const starts = bounds.starts;
            const stops = bounds.stops;
            // Frame boundaries are monotonic, so these endpoints imply that
            // every requested frame covers the same whole partition.
            const wholePartition =
                starts[starts.length - 1] == 0 && stops[0] == rows.length;
            const state = new WindowAggregateState(
                accessor,
                ops,
                wholePartition
            );

            let start = 0;
            let stop = 0;

            for (let index = 0; index < starts.length; index++) {
                const nextStart = starts[index];
                const nextStop = stops[index];
                while (start < nextStart) {
                    state.remove(rows[start++]);
                }
                while (stop < nextStop) {
                    state.add(rows[stop++]);
                }

                if (wholePartition) {
                    state.sortValues();
                    for (let i = 0; i < readers.length; i++) {
                        resultArrays[i].fill(readers[i](state));
                    }
                    return;
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
            return (state) => (state.valid ? state.min() : undefined);
        case "max":
            return (state) => (state.valid ? state.max() : undefined);
        case "mean":
            return (state) => (state.valid ? state.mean : undefined);
        case "q1":
            return (state) => (state.valid ? state.quantile(0.25) : undefined);
        case "median":
            return (state) => (state.valid ? state.quantile(0.5) : undefined);
        case "q3":
            return (state) => (state.valid ? state.quantile(0.75) : undefined);
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
class WindowAggregateState {
    /** @type {(datum: Datum) => any} */
    accessor;

    /** @type {boolean} */
    needsSum;

    /** @type {boolean} */
    needsMoments;

    /** @type {boolean} */
    needsOrderedValues;

    valid = 0;
    sum = 0;
    mean = 0;
    m2 = 0;

    /** @type {number[][]} */
    #blocks = [[]];

    /**
     * @param {(datum: Datum) => any} accessor
     * @param {string[]} ops
     * @param {boolean} [deferSorting]
     */
    constructor(accessor, ops, deferSorting = false) {
        this.accessor = accessor;
        this.needsSum = ops.includes("sum");
        this.needsMoments = ops.some((op) => MOMENT_OPS.has(op));
        this.needsOrderedValues = ops.some((op) => ORDERED_OPS.has(op));
        this.deferSorting = deferSorting;
    }

    sortValues() {
        const values = this.#blocks[0];
        values.sort(compareNumbers);

        // Left insertion reverses ties. Only signed zeros can compare equal
        // while remaining observably different.
        for (
            let left = findInsertIndex(values, 0),
                right = bisectRight(values, 0) - 1;
            left < right;
            left++, right--
        ) {
            const value = values[left];
            values[left] = values[right];
            values[right] = value;
        }
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
            this.#changeOrdered(numericValue, true);
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
            this.#changeOrdered(numericValue, false);
        }
    }

    /**
     * @param {number} value
     * @param {boolean} add
     */
    #changeOrdered(value, add) {
        const blocks = this.#blocks;
        const index =
            blocks.length == 1
                ? 0
                : findBlock(blocks, value, 0, blocks.length - 1);
        const block = blocks[index];
        let offset = block.length;
        if (add && (this.deferSorting || value > block[offset - 1])) {
            block.push(value);
        } else {
            offset = findInsertIndex(block, value);
            if (add) {
                block.splice(offset, 0, value);
            } else {
                if (block[offset] !== value) {
                    throw new Error("Window aggregate state is inconsistent.");
                }
                block.splice(offset, 1);
            }
        }

        if (blocks.length == 1) {
            // A single block stays flat until a splice shifts thousands of values.
            if (block.length - offset >= BLOCK_SHIFT_THRESHOLD) {
                this.#blocks = [];
                for (let i = 0; i < block.length; i += BLOCK_SIZE) {
                    this.#blocks.push(block.slice(i, i + BLOCK_SIZE));
                }
            }
        } else if (block.length > 2 * BLOCK_SIZE) {
            blocks.splice(index + 1, 0, block.splice(BLOCK_SIZE));
        } else if (block.length == 0) {
            blocks.splice(index, 1);
        } else if (!add && block.length < BLOCK_SIZE) {
            const left = Math.min(index, blocks.length - 2);
            if (
                blocks[left].length + blocks[left + 1].length <=
                BLOCK_SIZE * 1.5
            ) {
                blocks[left].push(...blocks[left + 1]);
                blocks.splice(left + 1, 1);
            }
        }
    }

    min() {
        return this.#blocks[0][0];
    }

    max() {
        const block = this.#blocks[this.#blocks.length - 1];
        return block[block.length - 1];
    }

    /** @param {number} p */
    quantile(p) {
        const blocks = this.#blocks;
        if (blocks.length == 1) {
            return quantileSorted(blocks[0], p);
        }
        const position = (this.valid - 1) * p;
        const rank = Math.floor(position);
        let index = rank;
        let blockIndex = 0;
        while (index >= blocks[blockIndex].length) {
            index -= blocks[blockIndex++].length;
        }
        const block = blocks[blockIndex];
        const lower = block[index];
        const upper =
            index + 1 < block.length
                ? block[index + 1]
                : blocks[blockIndex + 1][0];
        return lower + (upper - lower) * (position - rank);
    }
}

// Stop at the final block even when a value sorts after its maximum.
const findBlock = bisector(
    /** @param {number[]} block */ (block) => block[block.length - 1]
).left;

/**
 * Match numeric bisectLeft, including NaNs at the end of the array.
 * @param {number[]} values
 * @param {number} value
 */
function findInsertIndex(values, value) {
    let low = 0;
    let high = values.length;
    if (Number.isNaN(value)) {
        return high;
    }
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (values[middle] < value) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    return low;
}

/**
 * Matches bisectLeft's order, which places numeric NaNs after other values.
 * @param {number} a
 * @param {number} b
 */
function compareNumbers(a, b) {
    return a < b ? -1 : a > b ? 1 : Number(a !== a) - Number(b !== b);
}
