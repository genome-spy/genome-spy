import { iterateDataDependencies } from "./dataReadiness.js";
import DataSource from "./sources/dataSource.js";
import { shallowArrayEquals } from "../utils/arrayUtils.js";

/** @typedef {import("../spec/channel.js").Scalar | null | readonly import("../spec/channel.js").Scalar[]} FlowOutputValue */

/** A producer-owned value, independent of the rows flowing through its node. */
export default class FlowOutput {
    /** @type {import("./flowNode.js").default | undefined} */
    producer;

    /** @type {FlowOutputValue | undefined} */
    candidate;

    ready = false;

    revision = 0;

    /**
     * @param {import("../paramRuntime/viewParamRuntime.js").default} runtime
     * @param {string} name
     * @param {FlowOutputValue} initialValue
     */
    constructor(runtime, name, initialValue) {
        this.value = runtime.signal(name, initialValue);
    }

    publish() {
        if (this.candidate === undefined || this.producer.disposed) return;
        for (const input of iterateDataDependencies(this.producer)) {
            if (
                !input.isDataReady() ||
                (input instanceof DataSource && !input.resultSuccessful)
            )
                return;
        }

        this.ready = true;
        this.revision++;
        const previous = this.value.get();
        const equal =
            Array.isArray(previous) && Array.isArray(this.candidate)
                ? shallowArrayEquals(previous, this.candidate)
                : Object.is(previous, this.candidate);
        if (!equal) this.value.set(this.candidate);
    }
}

/**
 * Publishers require complete successful snapshots from every primary and side source.
 * @param {import("./flowNode.js").default} producer
 */
export function validateOutputSources(producer) {
    for (const node of iterateDataDependencies(producer)) {
        if (node instanceof DataSource && !node.supportsFlowOutputs)
            throw new Error(
                "Transform outputs do not support source: " + node.label
            );
    }
}

/**
 * Source completion and cached replay share a successful value-publication boundary.
 * Direct collector observers still run inside that boundary; graph effects see
 * committed outputs. Failed boundaries discard candidates without rolling back rows.
 * @template T
 * @param {import("./flowNode.js").default} root
 * @param {() => T} action
 * @param {import("../paramRuntime/viewParamRuntime.js").default | undefined} runtime
 * @param {boolean} [successful]
 */
export function runFlowPublication(root, action, runtime, successful = true) {
    /** @type {FlowOutput[]} */
    const outputs = [];
    root.visit((node) => {
        if (node.output) outputs.push(node.output);
    });
    const run = () => {
        try {
            const result = action();
            if (successful) for (const output of outputs) output.publish();
            return result;
        } finally {
            for (const output of outputs) output.candidate = undefined;
        }
    };
    return runtime ? runtime.runInTransaction(run) : run();
}

/**
 * Branch declarations share their owning view's lexical scope.
 * @param {import("../spec/transform.js").TransformParams[]} transforms
 * @returns {Generator<import("../spec/transform.js").ValuesParams | import("../spec/transform.js").CountParams>}
 */
export function* getOutputDeclarations(transforms) {
    for (const transform of transforms) {
        if (transform.type === "values" || transform.type === "count")
            yield transform;
        else if (transform.type === "branch")
            yield* getOutputDeclarations(transform.transform);
    }
}
