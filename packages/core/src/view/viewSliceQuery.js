import { isContinuous, isDiscrete } from "vega-scale";
import { cloneDetached, getReadyCollector } from "./viewDataApi.js";
import { buildReadinessRequest } from "./dataReadiness.js";
import { isDataReady } from "../data/dataReadiness.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import AGGREGATE_OPS from "../data/transforms/aggregateOps.js";
import { field } from "../utils/field.js";

/** @typedef {import("./unitView.js").default} UnitView */
/** @typedef {import("../types/viewQueryApi.js").ViewSliceQueryOptions} Options */
/** @typedef {import("../types/viewQueryApi.js").ViewSliceQueryResult} Result */
/** @typedef {import("../data/flowNode.js").Datum} Datum */
/** @typedef {"x" | "y"} Channel */

/**
 * Scans live transformed data cooperatively. Retains matching row references only
 * when aggregation needs them; no input datum is cloned to compute statistics.
 * @param {() => import("./view.js").default} resolve
 * @param {Options} options
 * @returns {Promise<Result>}
 */
export async function queryViewData(resolve, options) {
    validateOptions(options);
    options = {
        ...options,
        channels: [...options.channels],
        fields: options.fields?.slice(),
        aggregate: options.aggregate?.map((item) => ({ ...item })),
    };
    options.signal?.throwIfAborted();

    const view = /** @type {UnitView} */ (resolve());
    const collector = getReadyCollector(view);

    const scope = captureScope(view, options);
    const stamp = JSON.stringify(scope);
    const predicates = makePredicates(view, scope);
    const fields = options.fields?.map((name) => ({
        name,
        accessor: field(name),
    }));
    const operations = (options.aggregate ?? []).map(
        ({ op, field: name, as }) => ({
            op,
            as,
            accessor: name === undefined ? undefined : field(name),
        })
    );

    /** @type {Datum[]} */
    const matched = [];
    /** @type {Result} */
    const result = {
        rows: [],
        rowsExamined: 0,
        rowsMatched: 0,
        truncated: false,
        aggregates: {},
        scope,
    };

    for (const row of collector.getData()) {
        if (result.rowsExamined > 0 && result.rowsExamined % 1024 === 0) {
            // Yield to cancellation, navigation and source publications, then
            // reject changed scope rather than mixing observations or retrying.
            await new Promise((done) => setTimeout(done, 0));
            assertCurrent();
        }
        result.rowsExamined++;
        if (!predicates.every((test) => test(row))) {
            continue;
        }
        result.rowsMatched++;
        if (operations.length) {
            matched.push(row);
        }
        if (result.rows.length < options.limit) {
            const output = fields
                ? Object.fromEntries(
                      fields.map(({ name, accessor }) => [name, accessor(row)])
                  )
                : row;
            const detached = cloneDetached(output);
            delete detached[UNIQUE_ID_KEY];
            result.rows.push(detached);
        }
    }

    for (const { op, as, accessor } of operations) {
        Object.defineProperty(result.aggregates, as, {
            value: AGGREGATE_OPS[op](matched, accessor) ?? null,
            enumerable: true,
        });
    }
    // min/max may return source objects; aggregation must detach them too.
    result.aggregates = cloneDetached(result.aggregates);
    result.truncated = result.rowsMatched > result.rows.length;
    assertCurrent();
    return result;

    function assertCurrent() {
        options.signal?.throwIfAborted();
        if (
            resolve() !== view ||
            view.getCollector() !== collector ||
            !isDataReady(collector, buildReadinessRequest(view, ["x", "y"])) ||
            JSON.stringify(captureScope(view, options)) !== stamp
        ) {
            throw new Error(
                "Slice query was invalidated by a chart or data change."
            );
        }
    }
}

/** @param {Options} options */
function validateOptions(options) {
    if (
        !options ||
        !Number.isInteger(options.limit) ||
        options.limit < 0 ||
        options.limit > 1000
    ) {
        throw new Error("Slice query limit must be an integer from 0 to 1000.");
    }
    if (
        !Array.isArray(options.channels) ||
        !options.channels.length ||
        options.channels.some((c) => c !== "x" && c !== "y") ||
        new Set(options.channels).size !== options.channels.length
    ) {
        throw new Error("Slice query channels must be unique x/y axes.");
    }
    if (
        options.selection !== undefined &&
        (typeof options.selection !== "string" || !options.selection.length)
    ) {
        throw new Error("Slice selection must be a parameter name.");
    }
    if (
        options.fields !== undefined &&
        (!Array.isArray(options.fields) ||
            options.fields.some(
                (name) =>
                    typeof name !== "string" ||
                    !name.length ||
                    name === UNIQUE_ID_KEY
            ))
    ) {
        throw new Error("Slice fields must be public field names.");
    }
    const names = new Set();
    if (options.aggregate !== undefined && !Array.isArray(options.aggregate)) {
        throw new Error("Slice aggregates must be an array.");
    }
    for (const item of options.aggregate ?? []) {
        if (
            !item ||
            ![
                "count",
                "valid",
                "sum",
                "min",
                "max",
                "mean",
                "variance",
            ].includes(item.op) ||
            typeof item.as !== "string" ||
            !item.as.length ||
            names.has(item.as) ||
            (item.op !== "count" &&
                (typeof item.field !== "string" || !item.field.length))
        ) {
            throw new Error(
                "Invalid slice aggregate operation, field or result name."
            );
        }
        if (
            item.field !== undefined &&
            (typeof item.field !== "string" ||
                !item.field.length ||
                item.field === UNIQUE_ID_KEY)
        ) {
            throw new Error("Aggregate fields must be public field names.");
        }
        names.add(item.as);
    }
}

/**
 * Captures the exact state against which the scan is evaluated.
 * @param {UnitView} view
 * @param {Options} options
 * @returns {Result["scope"]}
 */
function captureScope(view, options) {
    /** @type {Result["scope"]} */
    const scope = {
        type: "viewport",
        domains: {},
        dataRevision: view.getCollector().dataRevision,
        data: "loaded-transformed",
        sourceCoverage: "unknown",
    };
    for (const channel of options.channels) {
        const resolution = view.getScaleResolution(channel);
        const scaleType = resolution?.getScale().type;
        if (!isContinuous(scaleType) || isDiscrete(scaleType)) {
            throw new Error(
                "Slice queries require a continuous scale on " + channel + "."
            );
        }
        const domain = resolution.getDomain();
        if (
            !domain ||
            domain.length !== 2 ||
            !domain.every(
                (value) => typeof value === "number" && Number.isFinite(value)
            ) ||
            domain[0] === domain[1]
        ) {
            throw new Error(
                "Slice queries require a finite numeric or locus domain on " +
                    channel +
                    "."
            );
        }
        scope.domains[channel] = Array.from(domain);
    }
    if (options.selection !== undefined) {
        const value = view.paramRuntime.findValue(options.selection);
        if (value?.type !== "interval") {
            throw new Error(
                "Slice queries require a named interval selection."
            );
        }
        for (const [channel, interval] of Object.entries(value.intervals)) {
            if (
                (channel !== "x" && channel !== "y") ||
                (interval !== null &&
                    (!Array.isArray(interval) ||
                        interval.length !== 2 ||
                        !interval.every(Number.isFinite)))
            ) {
                throw new Error("Unsupported interval selection coordinates.");
            }
        }
        scope.selection = {
            name: options.selection,
            value: cloneDetached(value),
        };
    }
    return scope;
}

/**
 * The mark's normalized encoders already incorporate genomic linearization,
 * offsets and supported inherited channels. Scope uses these data coordinates;
 * it does not infer geometry from field names or test pixel occlusion.
 * @param {UnitView} view
 * @param {Result["scope"]} scope
 * @returns {((row: Datum) => boolean)[]}
 */
function makePredicates(view, scope) {
    /** @type {Partial<Record<Channel, number[] | null>>} */
    const domains = Object.fromEntries(
        Object.entries(scope.domains).map(([channel, domain]) => [
            channel,
            ordered(domain),
        ])
    );
    if (scope.selection) {
        const intervals = /** @type {[Channel, number[]][]} */ (
            Object.entries(scope.selection.value.intervals).filter(
                ([, interval]) => interval !== null
            )
        );
        if (!intervals.length) {
            return [() => false];
        }
        for (const [channel, interval] of intervals) {
            const [lo, hi] = ordered(interval);
            const viewport = domains[channel];
            domains[channel] = viewport
                ? [
                      Math.max(Math.min(...viewport), lo),
                      Math.min(Math.max(...viewport), hi),
                  ]
                : [lo, hi];
        }
    }
    return Object.entries(domains).map(([channel, domain]) => {
        const [lo, hi] = domain;
        const start = positionAccessor(view, /** @type {Channel} */ (channel));
        const endChannel = /** @type {"x2" | "y2"} */ (channel + "2");
        const end = view.mark.encoders[endChannel]
            ? positionAccessor(view, endChannel)
            : undefined;

        return (row) => {
            if (lo >= hi) return false;
            const a = start(row);
            if (typeof a !== "number" || !Number.isFinite(a)) return false;
            if (!end) return a >= lo && a < hi;
            const b = end(row);
            if (typeof b !== "number" || !Number.isFinite(b)) return false;

            // Rule marks repeat the scalar coordinate on their perpendicular
            // axis. Equal endpoints therefore use point containment.
            if (a === b) return a >= lo && a < hi;
            return Math.min(a, b) < hi && Math.max(a, b) > lo;
        };
    });
}

/** @param {number[]} values @returns {number[]} */
function ordered(values) {
    return values[0] <= values[1] ? values : [values[1], values[0]];
}

/**
 * Dynamic expressions and conditional positions need revision ownership before
 * they can participate in a stable scan. Ordinary field and constant positions
 * use the same raw accessors as rendering.
 * @param {UnitView} view
 * @param {import("../spec/channel.js").PositionalChannel} channel
 */
function positionAccessor(view, channel) {
    const encoder = view.mark.encoders[channel];
    const branch = encoder?.branches[0];
    const def = branch?.accessor.channelDef;
    if (
        !encoder ||
        encoder.branches.length !== 1 ||
        !def ||
        !(
            "field" in def ||
            ("datum" in def && typeof def.datum === "number")
        ) ||
        ("scale" in def && def.scale === null)
    ) {
        throw new Error(
            "Slice queries require unconditional data-space positions on " +
                channel +
                "."
        );
    }
    return branch.accessor;
}
