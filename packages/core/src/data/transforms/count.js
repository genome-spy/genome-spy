import { validateOutputSources } from "../flowOutput.js";
import Transform from "./transform.js";

/** Counts a completed snapshot without buffering or changing its rows. */
export default class CountTransform extends Transform {
    #count = 0;

    /**
     * @param {import("../../spec/transform.js").CountParams} params
     * @param {import("../../view/view.js").default} view
     */
    constructor(params, view) {
        super(params, view);
        this.output = view.paramRuntime.getOutput(params.param);
        if (this.output.producer)
            throw new Error('Duplicate producer for "' + params.param + '".');
        this.output.producer = this;
    }

    initialize() {
        validateOutputSources(this);
    }

    reset() {
        this.#count = 0;
        this.output.ready = false;
        this.output.candidate = undefined;
        super.reset();
    }

    /** @param {import("../flowNode.js").Datum} datum */
    handle(datum) {
        this.#count++;
        this._propagate(datum);
    }

    complete() {
        super.complete();
        this.output.candidate = this.#count;
    }
}
