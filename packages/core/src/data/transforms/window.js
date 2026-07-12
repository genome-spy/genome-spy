import { compare } from "vega-util";
import { field } from "../../utils/field.js";
import { BEHAVIOR_MODIFIES } from "../flowNode.js";
import Transform from "./transform.js";
import {
    WindowAggregateState,
    WINDOW_AGGREGATE_OPS,
} from "./windowAggregateOps.js";
import {
    createWindowOperation,
    FIELDLESS_WINDOW_OPS,
    WINDOW_ONLY_OPS,
} from "./windowOps.js";

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
        this.operations = normalized.operations;
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
        const contexts = createContexts(
            rows,
            this.comparator,
            this.frame,
            this.ignorePeers
        );
        const results = this.operations.map(() => new Array(rows.length));

        this.#evaluateAggregateOperations(contexts, results);
        this.#evaluateWindowOperations(contexts, results);

        for (const context of contexts) {
            for (let i = 0; i < this.operations.length; i++) {
                context.rows[context.index][this.operations[i].as] =
                    results[i][context.index];
            }
        }
    }

    /**
     * @param {WindowContext[]} contexts
     * @param {any[][]} results
     */
    #evaluateAggregateOperations(contexts, results) {
        /** @type {Map<string | null, { accessor: ((datum: Datum) => any) | undefined, indices: number[] }>} */
        const groups = new Map();

        for (let i = 0; i < this.operations.length; i++) {
            const operation = this.operations[i];
            if (operation.kind == "aggregate") {
                const key = operation.field;
                let group = groups.get(key);
                if (!group) {
                    group = {
                        accessor: operation.accessor,
                        indices: [],
                    };
                    groups.set(key, group);
                }
                group.indices.push(i);
            }
        }

        for (const group of groups.values()) {
            const ops = group.indices.map((index) => this.operations[index].op);
            const state = new WindowAggregateState(group.accessor, ops);
            let start = 0;
            let stop = 0;

            for (const context of contexts) {
                while (start < context.start) {
                    state.remove(context.rows[start++]);
                }
                while (start > context.start) {
                    state.add(context.rows[--start]);
                }
                while (stop < context.stop) {
                    state.add(context.rows[stop++]);
                }
                while (stop > context.stop) {
                    state.remove(context.rows[--stop]);
                }

                for (const index of group.indices) {
                    results[index][context.index] = state.value(
                        this.operations[index].op
                    );
                }
            }
        }
    }

    /**
     * @param {WindowContext[]} contexts
     * @param {any[][]} results
     */
    #evaluateWindowOperations(contexts, results) {
        for (let i = 0; i < this.operations.length; i++) {
            const operation = this.operations[i];
            if (operation.kind == "window") {
                const evaluator = createWindowOperation(
                    /** @type {import("../../spec/transform.js").WindowOnlyOp} */ (
                        operation.op
                    ),
                    operation.accessor,
                    operation.parameter
                );
                evaluator.initialize();
                for (const context of contexts) {
                    results[i][context.index] = evaluator.evaluate(context);
                }
            }
        }
    }
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
 * @typedef {object} WindowContext
 * @prop {Datum[]} rows
 * @prop {number} index
 * @prop {number} start
 * @prop {number} stop
 * @prop {number} peerStart
 * @prop {number} peerStop
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

    /** @type {CompiledOperation[]} */
    const operations = params.ops.map((op, index) => {
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
        if (
            output != null &&
            (typeof output != "string" || output.length == 0)
        ) {
            throw new Error(
                "Window output field names must be non-empty strings."
            );
        }

        return {
            op,
            kind,
            field: fieldName,
            accessor: fieldName == null ? undefined : field(fieldName),
            parameter,
            as: output ?? defaultOutputName(op, fieldName),
        };
    });

    return {
        frame,
        ignorePeers: params.ignorePeers ?? false,
        comparator,
        groupAccessors,
        operations,
    };
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

    return rows
        .map((datum, index) => ({ datum, index }))
        .sort((a, b) => comparator(a.datum, b.datum) || a.index - b.index)
        .map(({ datum }) => datum);
}

/**
 * @param {Datum[]} rows
 * @param {((a: Datum, b: Datum) => number) | undefined} comparator
 * @param {[number | null, number | null]} frame
 * @param {boolean} ignorePeers
 * @returns {WindowContext[]}
 */
function createContexts(rows, comparator, frame, ignorePeers) {
    const peerStarts = new Array(rows.length);
    const peerStops = new Array(rows.length);

    let start = 0;
    for (let i = 0; i <= rows.length; i++) {
        if (
            i == rows.length ||
            !comparator ||
            comparator(rows[start], rows[i])
        ) {
            for (let j = start; j < i; j++) {
                peerStarts[j] = start;
                peerStops[j] = i;
            }
            start = i;
        }
    }

    return rows.map((_, index) => {
        let frameStart =
            frame[0] == null ? 0 : clamp(index + frame[0], 0, rows.length);
        let frameStop =
            frame[1] == null
                ? rows.length
                : clamp(index + frame[1] + 1, 0, rows.length);

        if (comparator && !ignorePeers) {
            if (
                frameStart > 0 &&
                frameStart < rows.length &&
                peerStarts[frameStart] != frameStart
            ) {
                frameStart = peerStarts[frameStart];
            }
            if (frameStop > 0 && frameStop < rows.length) {
                frameStop = peerStops[frameStop - 1];
            }
        }

        if (frameStart > frameStop) {
            frameStop = frameStart;
        }

        return {
            rows,
            index,
            start: frameStart,
            stop: frameStop,
            peerStart: peerStarts[index],
            peerStop: peerStops[index],
        };
    });
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
