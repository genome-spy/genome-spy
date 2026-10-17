import FlowNode from "./flowNode.js";
import Collector from "./collector.js";
import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import FormulaTransform from "./transforms/formula.js";
import FilterTransform from "./transforms/filter.js";
import SampleTransform from "./transforms/sample.js";
import AggregateTransform from "./transforms/aggregate.js";
import AGGREGATE_OPS from "./transforms/aggregateOps.js";
import WindowTransform from "./transforms/window.js";

/** @type {Record<string, new (params: any, provider: import("./flowNode.js").ParamRuntimeProvider) => FlowNode>} */
const constructors = {
    formula: FormulaTransform,
    filter: FilterTransform,
    sample: SampleTransform,
    aggregate: AggregateTransform,
    window: WindowTransform,
};

/**
 * Executes a one-shot pipeline over owned input copies. Transforms may modify
 * those copies. Neither the runtime nor the graph connects to a live view.
 * @param {import("./flowNode.js").Datum[]} rows
 * @param {readonly import("../types/embedApi.js").AnalysisTransformParams[]} pipeline
 * @param {number} limit Output limit, applied only after the full calculation.
 */
export default function runDataTransforms(rows, pipeline, limit) {
    if (!Array.isArray(pipeline))
        throw new Error("transform must be an array.");

    const runtime = new ViewParamRuntime();
    const provider = { paramRuntime: runtime };
    const source = new FlowNode(provider);
    let tail = source;
    /** @type {FlowNode[]} */
    const nodes = [];
    try {
        for (const [index, params] of pipeline.entries()) {
            try {
                if (
                    !params ||
                    typeof params !== "object" ||
                    Array.isArray(params) ||
                    !Object.hasOwn(constructors, params.type)
                )
                    throw new Error(
                        "Unsupported analysis transform: " + params?.type
                    );
                if ("debounce" in params || "param" in params)
                    throw new Error(
                        "Analysis transforms do not accept reactive or selection parameters."
                    );
                if (
                    (params.type === "formula" || params.type === "filter") &&
                    typeof params.expr !== "string"
                )
                    throw new Error("Analysis expressions must be strings.");
                if (
                    params.type === "sample" &&
                    params.size !== undefined &&
                    (!Number.isSafeInteger(params.size) || params.size <= 0)
                )
                    throw new Error(
                        "sample.size must be a positive safe integer."
                    );

                if (params.type === "formula" && typeof params.as !== "string")
                    throw new Error("formula.as must be a field name.");
                if (
                    params.type === "aggregate" &&
                    params.ops?.some(
                        (/** @type {string} */ op) =>
                            !Object.hasOwn(AGGREGATE_OPS, op)
                    )
                )
                    throw new Error("Unsupported aggregate operation.");

                const node = new constructors[params.type](params, provider);
                tail.addChild(node);
                tail = node;
                nodes.push(node);
            } catch (cause) {
                throw new Error("transform[" + index + "]: " + cause.message, {
                    cause,
                });
            }
        }
        const collector = new Collector({ type: "collect" }, provider);
        tail.addChild(collector);
        source.initializeOnce();
        for (const [index, node] of nodes.entries()) {
            try {
                node.initializeOnce();
            } catch (cause) {
                throw new Error("transform[" + index + "]: " + cause.message, {
                    cause,
                });
            }
        }
        collector.initializeOnce();

        source.reset();
        source.beginBatch({ type: "file" });
        for (const row of rows) source.handle(row);
        source.complete();

        const output = [];
        for (const row of collector.getData()) {
            if (output.length === limit)
                return { rows: output, truncated: true };
            output.push(row);
        }
        return { rows: output, truncated: false };
    } finally {
        source.disposeSubtree();
        runtime.dispose();
    }
}
