import Collector from "./collector.js";
import { hasSuccessfulData, runFlowPublication } from "./flowOutput.js";
import { annotateSpecError } from "../utils/specError.js";

/** Materializes a named table from the publisher's input. */
export default class DerivedCollector extends Collector {
    #hasFileBatch = false;

    /**
     * @param {import("../spec/transform.js").PublishParams} params
     * @param {import("../view/view.js").default} view
     */
    constructor(params, view) {
        super({ type: "collect" }, view);
        this.producerView = view;
        this.name = params.dataset;
        this.specLocation = view.paramRuntime.getSpecLocation(params, [
            "dataset",
        ]);
        this.registerDisposer(() =>
            this.paramRuntime.cancelUpdate(this.#publish)
        );
    }

    /** @param {import("../types/flowBatch.js").FlowBatch} batch */
    beginBatch(batch) {
        if (batch.type === "facet" || this.#hasFileBatch) {
            throw annotateSpecError(
                new Error(
                    `Derived dataset "${this.name}" requires an unpartitioned table.`
                ),
                this.specLocation
            );
        }
        this.#hasFileBatch = true;
        super.beginBatch(batch);
    }

    complete() {
        // Wait for the input's completion fan-out, including source success
        // and any pending lookups that have yet to receive their side tables.
        this.paramRuntime.requestUpdate(this.#publish);
    }

    #publish = () => {
        if (!hasSuccessfulData(this.parent)) return;
        runFlowPublication(this, () => super.complete(), this.paramRuntime);
    };

    reset() {
        this.paramRuntime.cancelUpdate(this.#publish);
        this.#hasFileBatch = false;
        super.reset();
    }
}
