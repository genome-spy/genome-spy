import { compare } from "vega-util";
import { field } from "../../utils/field.js";
import { BEHAVIOR_MODIFIES } from "../flowNode.js";
import Transform from "./transform.js";
import {
    createAggregatePartitionEvaluator,
    WINDOW_AGGREGATE_OPS,
} from "./windowAggregateOps.js";
import {
    createWindowOperation,
    FIELDLESS_WINDOW_OPS,
    WINDOW_ONLY_OPS,
} from "./windowOps.js";

/**
 * Compatibility note: this transform follows Vega's declarative Window
 * contract for partitioning, sorting, frames, peers, and operation names.
 * The frame and peer-boundary logic is adapted from Vega's Window transform:
 * https://github.com/vega/vega/blob/main/packages/vega-transforms/src/Window.js
 *
 * GenomeSpy buffers and recomputes one FlowNode batch at a time. It does not
 * implement Vega's incremental pulse and tuple-list execution model.
 *
 * TODO: Add Vega's `aggregate_params` when operations that require it are
 * supported by windowAggregateOps.js.
 */

/** @typedef {import("../flowNode.js").Datum} Datum */

/**
 * Calculates window functions over sorted partitions while preserving input
 * propagation order. The transform buffers one FlowNode batch at a time.
 */
export default class WindowTransform extends Transform {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     * @param {import("../../spec/transform.js").WindowParams} params
     */
    constructor(params) {
        super(params);
        this.params = params;

        /** @type {Datum[]} */
        this.buffer = [];

        const normalized = normalizeParams(params);
        this.frame = normalized.frame;
        this.ignorePeers = normalized.ignorePeers;
        this.comparator = normalized.comparator;
        this.groupAccessors = normalized.groupAccessors;
        this.partitionEvaluators = normalized.partitionEvaluators;
        this.outputFields = normalized.outputFields;
    }

    reset() {
        super.reset();
        this.buffer = [];
    }

    /** @param {Datum} datum */
    handle(datum) {
        this.buffer.push(datum);
    }

    /**
     * @param {import("../../types/flowBatch.js").FlowBatch} flowBatch
     */
    beginBatch(flowBatch) {
        this.#flushBuffer();
        super.beginBatch(flowBatch);
    }

    complete() {
        this.#flushBuffer();
        super.complete();
    }

    #flushBuffer() {
        if (this.buffer.length == 0) {
            return;
        }

        const buffer = this.buffer;
        this.buffer = [];

        for (const partition of partitionRows(buffer, this.groupAccessors)) {
            this.#processPartition(partition);
        }

        for (const datum of buffer) {
            this._propagate(datum);
        }
    }

    /** @param {Datum[]} partition */
    #processPartition(partition) {
        const rows = sortedRows(partition, this.comparator);
        const bounds = createPartitionBounds(
            rows,
            this.comparator,
            this.frame,
            this.ignorePeers
        );
        const results = this.outputFields.map(() => new Array(rows.length));

        for (const evaluate of this.partitionEvaluators) {
            evaluate(rows, bounds, results);
        }

        writeResults(rows, results, this.outputFields);
    }
}

/**
 * @typedef {(rows: Datum[], bounds: PartitionBounds, results: any[][]) => void} PartitionEvaluator
 */

/**
 * @typedef {object} PartitionBounds
 * @prop {number[]} starts
 * @prop {number[]} stops
 * @prop {number[]} peerStarts
 * @prop {number[]} peerStops
 */

/**
 * @typedef {object} AggregateGroup
 * @prop {(datum: Datum) => any} accessor
 * @prop {{ op: string, resultIndex: number }[]} results
 */

/**
 * @param {import("../../spec/transform.js").WindowParams} params
 */
function normalizeParams(params) {
    if (!Array.isArray(params.ops) || params.ops.length == 0) {
        throw new Error(
            'The "ops" property must contain at least one operation.'
        );
    }

    validateAlignedArray("fields", params.fields, params.ops.length);
    validateAlignedArray("params", params.params, params.ops.length);
    validateAlignedArray("as", params.as, params.ops.length);

    const frame = params.frame ?? [null, 0];
    if (!Array.isArray(frame) || frame.length != 2) {
        throw new Error(
            'The "frame" property must contain exactly two offsets.'
        );
    }
    for (const value of frame) {
        if (
            value != null &&
            (!Number.isInteger(value) || !Number.isFinite(value))
        ) {
            throw new Error("Window frame offsets must be integers or null.");
        }
    }

    const groupAccessors = (params.groupby ?? []).map((name) => field(name));
    const comparator = params.sort
        ? compare(params.sort.field, params.sort.order)
        : undefined;

    /** @type {PartitionEvaluator[]} */
    const partitionEvaluators = [];
    /** @type {AggregateGroup[]} */
    const aggregateGroups = [];
    /** @type {Map<string, AggregateGroup>} */
    const aggregateGroupsByField = new Map();
    /** @type {{ resultIndex: number }[]} */
    const countResults = [];
    const outputFields = [];

    for (let resultIndex = 0; resultIndex < params.ops.length; resultIndex++) {
        const operation = compileOperation(params, resultIndex);
        outputFields.push(operation.as);

        if (operation.kind == "window") {
            const evaluate = createWindowOperation(
                /** @type {import("../../spec/transform.js").WindowOnlyOp} */ (
                    operation.op
                ),
                operation.accessor,
                operation.parameter
            );
            partitionEvaluators.push((rows, bounds, results) =>
                evaluate(rows, bounds, results[resultIndex])
            );
        } else if (operation.op == "count") {
            countResults.push({ resultIndex });
        } else {
            /** @type {string} */
            const fieldName = operation.field;
            let group = aggregateGroupsByField.get(fieldName);
            if (!group) {
                group = {
                    accessor: /** @type {(datum: Datum) => any} */ (
                        operation.accessor
                    ),
                    results: [],
                };
                aggregateGroupsByField.set(fieldName, group);
                aggregateGroups.push(group);
            }
            group.results.push({ op: operation.op, resultIndex });
        }
    }

    if (countResults.length) {
        partitionEvaluators.push(createCountEvaluator(countResults));
    }
    for (const group of aggregateGroups) {
        partitionEvaluators.push(
            createAggregatePartitionEvaluator(group.accessor, group.results)
        );
    }

    return {
        frame,
        ignorePeers: params.ignorePeers ?? false,
        comparator,
        groupAccessors,
        partitionEvaluators,
        outputFields,
    };
}

/**
 * @typedef {object} CompiledOperation
 * @prop {import("../../spec/transform.js").WindowOp} op
 * @prop {"aggregate" | "window"} kind
 * @prop {string | null} field
 * @prop {(datum: Datum) => any} [accessor]
 * @prop {number | null | undefined} parameter
 * @prop {string} as
 */

/**
 * @param {import("../../spec/transform.js").WindowParams} params
 * @param {number} index
 * @returns {CompiledOperation}
 */
function compileOperation(params, index) {
    const op = params.ops[index];
    const fieldName = params.fields?.[index] ?? null;
    const parameter = params.params?.[index];
    const kind = WINDOW_ONLY_OPS.has(op)
        ? "window"
        : WINDOW_AGGREGATE_OPS.has(op)
          ? "aggregate"
          : null;

    if (!kind) {
        throw new Error(`Unsupported window operation: ${op}`);
    }

    const requiresField =
        kind == "window" ? !FIELDLESS_WINDOW_OPS.has(op) : op != "count";
    if (requiresField && fieldName == null) {
        throw new Error(`Window operation "${op}" requires a field.`);
    }
    if (op == "ntile" || op == "nth_value") {
        if (!Number.isInteger(parameter) || parameter <= 0) {
            throw new Error(
                `Window operation "${op}" requires a positive integer parameter.`
            );
        }
    } else if (parameter != null && !Number.isFinite(parameter)) {
        throw new Error(
            `Window operation "${op}" requires a numeric parameter.`
        );
    }

    const output = params.as?.[index];
    if (output != null && (typeof output != "string" || output.length == 0)) {
        throw new Error("Window output field names must be non-empty strings.");
    }

    return {
        op,
        kind,
        field: fieldName,
        accessor: fieldName == null ? undefined : field(fieldName),
        parameter,
        as: output ?? defaultOutputName(op, fieldName),
    };
}

/**
 * @param {{ resultIndex: number }[]} countResults
 * @returns {PartitionEvaluator}
 */
function createCountEvaluator(countResults) {
    const resultIndices = countResults.map(({ resultIndex }) => resultIndex);

    return (rows, bounds, results) => {
        const resultArrays = resultIndices.map((index) => results[index]);
        const starts = bounds.starts;
        const stops = bounds.stops;

        for (let index = 0; index < rows.length; index++) {
            const count = stops[index] - starts[index];
            for (const result of resultArrays) {
                result[index] = count;
            }
        }
    };
}

/**
 * @param {Datum[]} rows
 * @param {any[][]} results
 * @param {string[]} outputFields
 */
function writeResults(rows, results, outputFields) {
    for (let index = 0; index < rows.length; index++) {
        const datum = rows[index];
        for (let i = 0; i < outputFields.length; i++) {
            datum[outputFields[i]] = results[i][index];
        }
    }
}

/**
 * @param {string} name
 * @param {unknown[] | undefined} values
 * @param {number} length
 */
function validateAlignedArray(name, values, length) {
    if (values && values.length != length) {
        throw new Error(
            `The "${name}" property must contain one entry for every window operation.`
        );
    }
}

/**
 * @param {string} op
 * @param {string | null} fieldName
 */
function defaultOutputName(op, fieldName) {
    return fieldName == null ? op : `${op}_${fieldName}`;
}

/**
 * @param {Datum[]} rows
 * @param {((a: Datum, b: Datum) => number) | undefined} comparator
 */
function sortedRows(rows, comparator) {
    if (!comparator) {
        return rows;
    }

    return rows.slice().sort(comparator);
}

/**
 * @param {Datum[]} rows
 * @param {((a: Datum, b: Datum) => number) | undefined} comparator
 * @param {[number | null, number | null]} frame
 * @param {boolean} ignorePeers
 * @returns {PartitionBounds}
 */
function createPartitionBounds(rows, comparator, frame, ignorePeers) {
    const length = rows.length;
    const peerStarts = new Array(length);
    const peerStops = new Array(length);
    const starts = new Array(length);
    const stops = new Array(length);

    if (comparator) {
        let peerStart = 0;
        for (let index = 1; index <= length; index++) {
            if (
                index == length ||
                comparator(rows[peerStart], rows[index]) != 0
            ) {
                for (
                    let peerIndex = peerStart;
                    peerIndex < index;
                    peerIndex++
                ) {
                    peerStarts[peerIndex] = peerStart;
                    peerStops[peerIndex] = index;
                }
                peerStart = index;
            }
        }
    } else {
        for (let index = 0; index < length; index++) {
            peerStarts[index] = index;
            peerStops[index] = index + 1;
        }
    }

    for (let index = 0; index < length; index++) {
        let start = frame[0] == null ? 0 : clamp(index + frame[0], 0, length);
        let stop =
            frame[1] == null ? length : clamp(index + frame[1] + 1, 0, length);

        if (comparator && !ignorePeers) {
            if (start > 0 && start < length && peerStarts[start] != start) {
                start = peerStarts[start];
            }
            if (stop > 0 && stop < length) {
                stop = peerStops[stop - 1];
            }
        }
        if (start > stop) {
            stop = start;
        }

        starts[index] = start;
        stops[index] = stop;
    }

    return { starts, stops, peerStarts, peerStops };
}

/**
 * @param {number} value
 * @param {number} minimum
 * @param {number} maximum
 */
function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(value, maximum));
}

/**
 * @param {Datum[]} rows
 * @param {((datum: Datum) => any)[]} accessors
 * @returns {Datum[][]}
 */
function partitionRows(rows, accessors) {
    if (accessors.length == 0) {
        return [rows];
    }

    /** @type {Map<any, any>} */
    const root = new Map();
    /** @type {Datum[][]} */
    const partitions = [];

    for (const datum of rows) {
        /** @type {Map<any, any>} */
        let level = root;
        for (let i = 0; i < accessors.length - 1; i++) {
            const key = accessors[i](datum);
            let next = level.get(key);
            if (!next) {
                next = new Map();
                level.set(key, next);
            }
            level = next;
        }

        const key = accessors.at(-1)(datum);
        let partition = level.get(key);
        if (!partition) {
            partition = [];
            level.set(key, partition);
            partitions.push(partition);
        }
        partition.push(datum);
    }

    return partitions;
}
