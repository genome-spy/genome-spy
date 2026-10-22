import Transform from "./transform.js";
import { annotateSpecError } from "../../utils/specError.js";

/**
 * Based on Vega's value/row separation and field projection design:
 * https://github.com/vega/vega/blob/c03b7d0fe369be1a6e81d23dc899aef6eb7da967/packages/vega-transforms/src/Values.js
 * GenomeSpy accumulates a whole flow result instead of processing tuple pulses.
 */
export default class ValuesTransform extends Transform {
    /** @type {import("../../spec/channel.js").Scalar[]} */
    #values = [];

    /**
     * @param {import("../../spec/transform.js").ValuesParams} params
     * @param {import("../../view/view.js").default} view
     */
    constructor(params, view) {
        super(params, view);
        this.params = params;
        this.field = this.createFieldAccessor(params, "field");
        this.output = view.paramRuntime.getOutput(params.param);
        if (this.output.producer)
            throw new Error('Duplicate producer for "' + params.param + '".');
        this.output.producer = this;
    }

    reset() {
        this.#values = [];
        this.output.candidate = undefined;
        super.reset();
    }

    /** @param {import("../flowNode.js").Datum} datum */
    handle(datum) {
        const value = this.field(datum);
        const type = typeof value;
        if (
            (type !== "string" && type !== "number" && type !== "boolean") ||
            (type === "number" && !Number.isFinite(value))
        ) {
            throw annotateSpecError(
                new Error(
                    `The values transform requires a scalar field: "${this.params.field}".`
                ),
                this.paramRuntime.getSpecLocation(this.params, ["field"])
            );
        }
        this.#values.push(value);
        this._propagate(datum);
    }

    complete() {
        super.complete();
        this.output.candidate = Object.freeze(this.#values);
    }
}
