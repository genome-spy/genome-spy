import { BEHAVIOR_MODIFIES } from "../flowNode.js";
import Transform from "./transform.js";

export default class FormulaTransform extends Transform {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     *
     * @param {import("../../spec/transform.js").FormulaParams} params
     * @param {import("../flowNode.js").ParamMediatorProvider} paramMediatorProvider
     */
    constructor(params, paramMediatorProvider) {
        super(params, paramMediatorProvider);

        this.params = params;

        this.as = params.as;

        /** @type {import("../../paramRuntime/types.js").ExprRefFunction} */
        this.fn = undefined;
    }

    initialize() {
        this.fn = this.paramRuntime.createExpression(this.params.expr);
        this.fn.addListener(() => this.repropagate());
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
