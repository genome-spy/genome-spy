import { splitAccessPath } from "vega-util";
import AggregateTransform from "../data/transforms/aggregate.js";
import WindowTransform from "../data/transforms/window.js";
import FilterTransform from "../data/transforms/filter.js";
import Collector from "../data/collector.js";
import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";

/** @typedef {import("../types/viewQueryApi.js").ViewSliceAnalysisStage} Stage */
/** @typedef {import("../data/flowNode.js").Datum} Datum */

const aggregateOps = new Set([
    "count",
    "valid",
    "sum",
    "min",
    "max",
    "mean",
    "variance",
]);
const operators = {
    gt: ">",
    gte: ">=",
    lt: "<",
    lte: "<=",
    eq: "===",
    neq: "!==",
};

/**
 * Validate stage references before scanning. Projected field paths are literal
 * column names in the analysis table, including names containing dots.
 * @param {Stage[]} stages
 * @param {string[] | undefined} fields
 */
export function validateAnalysis(stages, fields) {
    if (!Array.isArray(stages) || !Array.isArray(fields) || !fields.length) {
        throw new Error("Analysis requires a pipeline and explicit fields.");
    }
    if (new Set(fields).size !== fields.length) {
        throw new Error("Analysis fields must be unique.");
    }
    let available = new Set(fields);
    for (const stage of stages) {
        if (!stage || typeof stage !== "object")
            throw new Error("Invalid analysis stage.");
        const reference = (/** @type {string} */ name) => {
            if (!available.has(name))
                throw new Error(`Undisclosed analysis field: ${name}`);
        };
        if (stage.type === "filter") {
            checkKeys(stage, ["type", "field", "op", "value", "absolute"]);
            reference(stage.field);
            if (
                !Object.hasOwn(operators, stage.op) ||
                !Number.isFinite(stage.value) ||
                (stage.absolute !== undefined &&
                    typeof stage.absolute !== "boolean")
            ) {
                throw new Error("Invalid numeric analysis filter.");
            }
            continue;
        }
        if (stage.type !== "aggregate" && stage.type !== "window") {
            throw new Error("Unsupported analysis stage.");
        }
        checkKeys(
            stage,
            stage.type === "aggregate"
                ? ["type", "groupby", "fields", "ops", "as"]
                : ["type", "groupby", "sort", "fields", "ops", "as", "frame"]
        );
        const groupby = stage.groupby ?? [];
        if (
            !Array.isArray(groupby) ||
            new Set(groupby).size !== groupby.length
        ) {
            throw new Error("Invalid analysis grouping.");
        }
        groupby.forEach(reference);
        if (
            !Array.isArray(stage.ops) ||
            !stage.ops.length ||
            !Array.isArray(stage.as) ||
            stage.as.length !== stage.ops.length ||
            new Set(stage.as).size !== stage.as.length ||
            stage.as.some(
                (name) =>
                    !isOutputName(name) ||
                    groupby.includes(name) ||
                    (stage.type === "window" && available.has(name))
            )
        ) {
            throw new Error(
                "Analysis outputs must be unique, public column names without collisions."
            );
        }
        if (stage.type === "aggregate") {
            if (
                !Array.isArray(stage.fields) ||
                stage.fields.length !== stage.ops.length
            ) {
                throw new Error(
                    "Analysis aggregate fields must align with operations."
                );
            }
            stage.ops.forEach((op, i) => {
                if (!aggregateOps.has(op))
                    throw new Error("Unsupported analysis aggregate.");
                const name = stage.fields[i];
                if (name !== null) reference(name);
                else if (op !== "count")
                    throw new Error("Aggregate operation requires a field.");
            });
            available = new Set([...groupby, ...stage.as]);
        } else {
            if (
                stage.ops.some((op) => op !== "count" && op !== "row_number") ||
                !Array.isArray(stage.frame) ||
                stage.frame.length !== 2 ||
                stage.frame.some((v) => v !== null) ||
                (stage.fields !== undefined &&
                    (!Array.isArray(stage.fields) ||
                        stage.fields.length !== stage.ops.length ||
                        stage.fields.some((v) => v !== null)))
            ) {
                throw new Error(
                    "Analysis window supports row_number/count over the full partition."
                );
            }
            if (stage.sort !== undefined) {
                if (!stage.sort || typeof stage.sort !== "object")
                    throw new Error("Invalid analysis sort.");
                checkKeys(stage.sort, ["field", "order"]);
                const names = Array.isArray(stage.sort.field)
                    ? stage.sort.field
                    : [stage.sort.field];
                if (!names.length)
                    throw new Error("Analysis sort requires fields.");
                names.forEach(reference);
                const orders = Array.isArray(stage.sort.order)
                    ? stage.sort.order
                    : [stage.sort.order ?? "ascending"];
                if (
                    (Array.isArray(stage.sort.order) &&
                        orders.length !== names.length) ||
                    orders.some(
                        (order) =>
                            order !== "ascending" && order !== "descending"
                    )
                ) {
                    throw new Error("Invalid analysis sort order.");
                }
            }
            stage.as.forEach((name) => available.add(name));
        }
    }
}

/** @param {object} value @param {string[]} keys */
function checkKeys(value, keys) {
    if (Object.keys(value).some((key) => !keys.includes(key))) {
        throw new Error("Unsupported analysis option.");
    }
}

/** @param {unknown} name */
function isOutputName(name) {
    return (
        typeof name === "string" &&
        name.length > 0 &&
        !splitAccessPath(name).some((part) =>
            [UNIQUE_ID_KEY, "__proto__", "constructor", "prototype"].includes(
                part
            )
        )
    );
}

/** @param {string} name */
function column(name) {
    return "[" + JSON.stringify(name) + "]";
}

/**
 * Source projection normalizes missing values to null while retaining the normal public
 * field-path grammar. Detachment is performed by the query before transforms.
 * @param {Datum} row
 * @param {string[]} fields
 */
export function projectAnalysisRow(row, fields) {
    return Object.fromEntries(
        fields.map((name) => [
            name,
            splitAccessPath(name).reduce(
                (value, part) => (value == null ? undefined : value[part]),
                row
            ) ?? null,
        ])
    );
}

/**
 * Execute one existing transform on detached rows. Window writes are confined
 * to this query's table; expression listeners are disposed after every filter.
 * @param {Datum[]} rows
 * @param {Stage} stage
 * @returns {Datum[]}
 */
export function runAnalysisStage(rows, stage) {
    if (stage.type !== "filter") {
        const scalarFields = [...(stage.groupby ?? [])];
        if (stage.type === "window" && stage.sort) {
            scalarFields.push(
                ...(Array.isArray(stage.sort.field)
                    ? stage.sort.field
                    : [stage.sort.field])
            );
        }
        for (const row of rows) {
            for (const name of scalarFields) {
                const value = row[name];
                if (value == null) row[name] = null;
                else if (
                    !["string", "number", "boolean"].includes(typeof value) ||
                    (typeof value === "number" && !Number.isFinite(value))
                ) {
                    throw new Error(
                        "Analysis grouping and sorting require finite scalar or null values."
                    );
                }
            }
        }
    }
    let transform;
    if (stage.type === "filter") {
        const value = "datum" + column(stage.field);
        const compared = stage.absolute ? `abs(${value})` : value;
        // A numeric type guard prevents null/string coercion; the finite bound
        // rejects NaN and infinities without exposing caller expressions.
        const expr = `isNumber(${value}) && abs(${value}) <= ${Number.MAX_VALUE} && ${compared} ${operators[stage.op]} ${stage.value}`;
        transform = new FilterTransform(
            { type: "filter", expr },
            { paramRuntime: new ViewParamRuntime() }
        );
    } else if (stage.type === "aggregate") {
        transform = new AggregateTransform({
            ...stage,
            groupby: stage.groupby?.map(column),
            fields: stage.fields.map((name) => column(name ?? "")),
        });
    } else {
        transform = new WindowTransform({
            ...stage,
            groupby: stage.groupby?.map(column),
            sort: stage.sort
                ? {
                      ...stage.sort,
                      field: Array.isArray(stage.sort.field)
                          ? stage.sort.field.map(column)
                          : column(stage.sort.field),
                  }
                : undefined,
        });
    }
    const output = new Collector();
    transform.addChild(output);
    try {
        transform.initializeOnce();
        rows.forEach((row) => transform.handle(row));
        transform.complete();
        const result = Array.from(output.getData());
        if (stage.type === "aggregate") {
            return result.map((row) =>
                Object.fromEntries([
                    ...(stage.groupby ?? []).map((name) => [
                        name,
                        row[column(name)],
                    ]),
                    ...stage.as.map((name) => [name, row[name] ?? null]),
                ])
            );
        }
        return result;
    } finally {
        transform.disposeSubtree();
    }
}
