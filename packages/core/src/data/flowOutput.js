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
     * @param {import("../paramRuntime/types.js").WritableParamRef<readonly import("../spec/channel.js").Scalar[]>} value
     */
    constructor(value) {
        this.value = value;
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
export function finalizeFlowOutputs(root) {
    root.visit((view) => {
        view.paramRuntime.finalizeOutputDeclarations();
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
 * @returns {Generator<{
 *   transform: import("../spec/transform.js").TransformParams,
 *   property: "param" | "domainParam",
 *   param: import("../spec/transform.js").TransformOutput
 * }>}
 */
export function* getOutputDeclarations(transforms) {
    for (const transform of transforms) {
        if (transform.type === "values") {
            yield { transform, property: "param", param: transform.param };
        } else if (
            transform.type === "dendrogram" &&
            transform.domainParam !== undefined
        ) {
            yield {
                transform,
                property: "domainParam",
                param: transform.domainParam,
            };
        } else if (transform.type === "branch") {
            yield* getOutputDeclarations(transform.transform);
        }
    }
}
