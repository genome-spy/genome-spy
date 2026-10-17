import FlowNode from "./flowNode.js";
import Collector from "./collector.js";
import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import FormulaTransform from "./transforms/formula.js";
import FilterTransform from "./transforms/filter.js";
import SampleTransform from "./transforms/sample.js";
import AggregateTransform from "./transforms/aggregate.js";
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
    const runtime = new ViewParamRuntime();
    const provider = { paramRuntime: runtime };
    const source = new FlowNode(provider);
    let tail = source;
    /** @type {FlowNode[]} */
    const nodes = [];
    try {
        for (const [index, params] of pipeline.entries()) {
            try {
                if (!Object.hasOwn(constructors, params.type))
                    throw new Error(
                        "Unsupported analysis transform: " + params.type
                    );

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
