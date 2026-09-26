import { isContinuous, isDiscrete } from "vega-scale";
import { splitAccessPath } from "vega-util";
import {
    cloneDetached,
    getReadyCollector,
    QuerySupportError,
} from "./viewDataApi.js";
import { buildReadinessRequest } from "./dataReadiness.js";
import { isDataReady } from "../data/dataReadiness.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import AGGREGATE_OPS from "../data/transforms/aggregateOps.js";
import { field } from "../utils/field.js";
import {
    validateAnalysis,
    projectAnalysisRow,
    runAnalysisStage,
} from "./viewSliceAnalysis.js";
import { makeSelectionUnionTestExpression } from "../selection/selection.js";
import createFunction from "../utils/expression.js";

/** @typedef {import("./unitView.js").default} UnitView */
/** @typedef {import("../types/viewQueryApi.js").ViewSliceQueryOptions} Options */
/** @typedef {import("../types/viewQueryApi.js").ViewSliceQueryResult} Result */
/** @typedef {import("../data/flowNode.js").Datum} Datum */
/** @typedef {"x" | "y"} Channel */

/**
 * Scans live transformed data cooperatively. Scalar aggregation buffers source
 * references; analysis projects and detaches inputs before transform passes.
 * @param {() => import("./view.js").default} resolve
 * @param {Options} options
 * @param {(view: UnitView, rows: Datum[]) => string[]} [captureTargets]
 * @returns {Promise<Result>}
 */
export async function queryViewData(resolve, options, captureTargets) {
    validateOptions(options);
    const limit = options.limit ?? Infinity;
    if (
        options.includeAnnotationTargets &&
        (!captureTargets ||
            options.aggregate?.length ||
            options.analysis?.some((stage) => stage.type === "aggregate"))
    ) {
        throw new Error(
            "Annotation targets require a row-preserving query and an annotation controller."
        );
    }
    options = {
        ...options,
        channels: [...options.channels],
        fields: options.fields?.slice(),
        aggregate: options.aggregate?.map((item) => ({ ...item })),
        analysis:
            options.analysis === undefined
                ? undefined
                : cloneDetached(options.analysis),
    };
    options.signal?.throwIfAborted();

    const view = /** @type {UnitView} */ (resolve());
    const { collector, scope, predicates } = prepareQuery(view, options);
    const stamp = JSON.stringify(scope);
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

    /** @type {Datum[]} */
    let analyzed = [];
    // Row-preserving transforms retain detached object identity. Keep the
    // source association out of the projected values and public table.
    /** @type {WeakMap<Datum, Datum>} */
    const origins = new WeakMap();

    /** @type {Datum[]} */
    const targetRows = [];

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
        if (options.analysis !== undefined) {
            const projected = cloneDetached(
                projectAnalysisRow(row, options.fields)
            );
            analyzed.push(projected);
            if (options.includeAnnotationTargets) origins.set(projected, row);
        } else if (result.rows.length < limit) {
            const output = fields
                ? Object.fromEntries(
                      fields.map(({ name, accessor }) => [name, accessor(row)])
                  )
                : row;
            const detached = cloneDetached(output);
            delete detached[UNIQUE_ID_KEY];
            result.rows.push(detached);
            if (options.includeAnnotationTargets) targetRows.push(row);
        }
    }

    for (const { op, as, accessor } of operations) {
        // Aggregate operations reuse synchronous transform implementations.
        // Yield between passes so cancellation and chart changes remain observable.
        await new Promise((done) => setTimeout(done, 0));
        assertCurrent();
        Object.defineProperty(result.aggregates, as, {
            value: AGGREGATE_OPS[op](matched, accessor) ?? null,
            enumerable: true,
        });
    }
    if (options.analysis !== undefined) {
        for (const stage of options.analysis) {
            await new Promise((done) => setTimeout(done, 0));
            assertCurrent();
            analyzed = runAnalysisStage(analyzed, stage);
        }
        result.outputRows = analyzed.length;
        const preview = analyzed.slice(0, limit);
        result.rows = cloneDetached(preview);
        if (options.includeAnnotationTargets) {
            for (const row of preview) targetRows.push(origins.get(row));
        }
        result.scope.analysis = options.analysis;
    }
    // min/max may return source objects; aggregation must detach them too.
    result.aggregates = cloneDetached(result.aggregates);
    result.truncated =
        (result.outputRows ?? result.rowsMatched) > result.rows.length;
    assertCurrent();
    if (options.includeAnnotationTargets)
        result.annotationTargets = captureTargets(view, targetRows);
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
        (options.limit !== null &&
            (!Number.isSafeInteger(options.limit) || options.limit < 0))
    ) {
        throw new Error(
            "Slice query limit must be null or a nonnegative safe integer."
        );
    }
    if (
        options.includeAnnotationTargets !== undefined &&
        typeof options.includeAnnotationTargets !== "boolean"
    ) {
        throw new Error("includeAnnotationTargets must be boolean.");
    }
    validateScopeOptions(options);
    if (
        options.fields !== undefined &&
        (!Array.isArray(options.fields) || !options.fields.every(isPublicField))
    ) {
        throw new Error("Slice fields must be public field names.");
    }
    if (options.analysis !== undefined) {
        if (options.aggregate !== undefined)
            throw new Error("Analysis cannot be combined with aggregate.");
        validateAnalysis(options.analysis, options.fields);
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
        if (item.field !== undefined && !isPublicField(item.field)) {
            throw new Error("Aggregate fields must be public field names.");
        }
        names.add(item.as);
    }
}

/**
 * Parse field paths with the accessor's grammar so quoting and escaping cannot
 * expose Core's root metadata. Nested fields remain ordinary user data.
 * @param {unknown} name
 */
function isPublicField(name) {
    if (typeof name !== "string" || !name.length) {
        return false;
    }
    const path = splitAccessPath(name);
    return path.length > 0 && path[0] !== UNIQUE_ID_KEY;
}

/**
 * Captures the exact state against which the scan is evaluated.
 * @param {UnitView} view
 * @param {import("../types/viewQueryApi.js").ViewQueryScopeOptions} options
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
        scope.domains[channel] = continuousDomain(view, channel);
    }
    if (options.selection !== undefined) {
        const value = view.paramRuntime.findValue(options.selection);
        if (value?.type !== "interval") {
            throw new QuerySupportError(
                "unsupported-selection",
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
                throw new QuerySupportError(
                    "unsupported-selection",
                    "Unsupported interval selection coordinates."
                );
            }
        }
        scope.selection = {
            name: options.selection,
            value: cloneDetached(value),
        };
    }
    return scope;
}

/** @param {UnitView} view @param {Channel} channel */
function continuousDomain(view, channel) {
    const resolution = view.getScaleResolution(channel);
    const scaleType = resolution?.getScale().type;
    if (!isContinuous(scaleType) || isDiscrete(scaleType)) {
        throw new QuerySupportError(
            "unsupported-scale",
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
        throw new QuerySupportError(
            "unsupported-scale",
            "Slice queries require a finite numeric or locus domain on " +
                channel +
                "."
        );
    }
    return Array.from(domain);
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
    if (
        scope.selection &&
        !Object.values(scope.selection.value.intervals).some(Boolean)
    ) {
        return [() => false];
    }
    const predicates = Object.entries(scope.domains).map(
        ([channel, domain]) => {
            const [lo, hi] = ordered(domain);
            const start = positionAccessor(
                view,
                /** @type {Channel} */ (channel)
            );
            const endChannel = /** @type {"x2" | "y2"} */ (channel + "2");
            const end = view.mark.encoders[endChannel]
                ? positionAccessor(view, endChannel)
                : undefined;

            return (/** @type {Datum} */ row) => {
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
        }
    );
    if (scope.selection) {
        predicates.push(selectionPredicate(view, scope.selection.value));
    }
    return predicates;
}

/**
 * Apply Core's selection membership separately from viewport clipping. Selection
 * boundaries are inclusive, and cleared dimensions follow Core's union semantics.
 * @param {UnitView} view
 * @param {import("../types/selectionTypes.js").IntervalSelection} selection
 */
function selectionPredicate(view, selection) {
    /** @type {Partial<Record<import("../spec/channel.js").PositionalChannel, string>>} */
    const fields = {};
    const positions = Object.entries(selection.intervals)
        .filter(([, interval]) => interval !== null)
        .map(([name]) => {
            const channel = /** @type {Channel} */ (name);
            const start = positionAccessor(view, channel);
            continuousDomain(view, channel);
            const secondary = /** @type {"x2" | "y2"} */ (channel + "2");
            const end = view.mark.encoders[secondary]
                ? positionAccessor(view, secondary)
                : start;
            fields[channel] = channel;
            fields[secondary] = secondary;
            return { channel, secondary, start, end };
        });
    const test = createFunction(
        makeSelectionUnionTestExpression(
            [{ param: "region", selection, fields }],
            false,
            view.mark.defaultHitTestMode
        ),
        { region: selection }
    );

    // The compiled membership expression reads this record synchronously.
    /** @type {Record<string, number>} */
    const point = {};

    return (/** @type {Datum} */ row) => {
        for (const { channel, secondary, start, end } of positions) {
            const a = start(row);
            const b = end(row);
            if (
                typeof a !== "number" ||
                typeof b !== "number" ||
                !Number.isFinite(a) ||
                !Number.isFinite(b)
            )
                return false;
            point[channel] = Math.min(a, b);
            point[secondary] = Math.max(a, b);
        }
        return test(point);
    };
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
        throw new QuerySupportError(
            "unsupported-position",
            "Slice queries require unconditional data-space positions on " +
                channel +
                "."
        );
    }
    return branch.accessor;
}

/** Check the same preparation used by execution, without scanning data.
 * @param {import("./view.js").default} view
 * @param {import("../types/viewQueryApi.js").ViewQueryScopeOptions} options
 * @returns {import("../types/viewQueryApi.js").ViewQueryAssessment}
 */
export function assessViewQuery(view, options) {
    validateScopeOptions(options);
    try {
        prepareQuery(/** @type {UnitView} */ (view), options);
        return { status: "ready" };
    } catch (error) {
        if (!(error instanceof QuerySupportError)) throw error;
        return error.reason === "data-not-ready"
            ? { status: "pending", reason: error.reason }
            : { status: "unsupported", reason: error.reason };
    }
}

/** One source of truth for assessment and execution prerequisites.
 * @param {UnitView} view
 * @param {import("../types/viewQueryApi.js").ViewQueryScopeOptions} options
 */
function prepareQuery(view, options) {
    const collector = getReadyCollector(view);
    const scope = captureScope(view, options);
    const predicates = makePredicates(view, scope);
    return { collector, scope, predicates };
}

/** @param {import("../types/viewQueryApi.js").ViewQueryScopeOptions} options */
function validateScopeOptions(options) {
    if (!options || typeof options !== "object" || Array.isArray(options)) {
        throw new Error("Query scope options are required.");
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
}
