import { iterateDataDependencies } from "./dataReadiness.js";
import DataSource from "./sources/dataSource.js";
import { shallowArrayEquals } from "../utils/arrayUtils.js";

/** A producer-owned value, independent of the rows flowing through its node. */
export default class FlowOutput {
    /** @type {import("../view/view.js").default | undefined} */
    owner;

    /** @type {import("../view/view.js").default | undefined} */
    producerView;

    /** @type {import("./flowNode.js").default | undefined} */
    producer;

    /** @type {readonly import("../spec/channel.js").Scalar[] | undefined} */
    candidate;

    /**
     * @param {import("../paramRuntime/viewParamRuntime.js").default} runtime
     * @param {string} name
     */
    constructor(runtime, name) {
        this.value = runtime.signal(
            name,
            /** @type {readonly import("../spec/channel.js").Scalar[]} */ (
                Object.freeze([])
            )
        );
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

        if (!shallowArrayEquals(this.value.get(), this.candidate))
            this.value.set(this.candidate);
    }
}

/** @param {import("../view/view.js").default} root */
export function validateFlowOutputs(root) {
    root.visit((view) => {
        for (const output of view.paramRuntime.outputs) {
            if (!output.producerView) {
                throw new Error(
                    "Output parameter has no producer in view " +
                        view.name +
                        "."
                );
            }
        }
    });
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
 * @returns {Generator<import("../spec/transform.js").ValuesParams>}
 */
export function* getOutputDeclarations(transforms) {
    for (const transform of transforms) {
        if (transform.type === "values") yield transform;
        else if (transform.type === "branch")
            yield* getOutputDeclarations(transform.transform);
    }
}
