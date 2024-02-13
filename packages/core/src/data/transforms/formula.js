import FlowNode, { BEHAVIOR_MODIFIES } from "../flowNode.js";

export default class FormulaTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     *
     * @param {import("../../spec/transform.js").FormulaParams} params
     * @param {import("../flowNode.js").ParamMediatorProvider} paramMediatorProvider
     */
    constructor(params, paramMediatorProvider) {
        super(paramMediatorProvider);

        this.params = params;

        this.as = params.as;

        /** @type {import("../../view/paramMediator.js").ExprRefFunction} */
        this.fn = undefined;
    }

    initialize() {
        this.fn = this.paramMediator.createExpression(this.params.expr);
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
