import { BEHAVIOR_MODIFIES } from "../flowNode.js";
import { preserveGrouping } from "../outputGrouping.js";
import Transform from "./transform.js";

export default class FormulaTransform extends Transform {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    get outputGrouping() {
        return preserveGrouping(this.parent?.outputGrouping, [this.as]);
    }

    /**
     *
     * @param {import("../../spec/transform.js").FormulaParams} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} paramRuntimeProvider
     */
    constructor(params, paramRuntimeProvider) {
        super(params, paramRuntimeProvider);

        this.params = params;

        this.as = params.as;

        /** @type {(datum?: import("../flowNode.js").Datum) => any} */
        this.fn = undefined;
    }

    initialize() {
        this.fn = this.watchSnapshottedExpression(this.params);
    }

    /**
     *
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
        datum[this.as] = this.fn(datum);
        this._propagate(datum);
    }
}
