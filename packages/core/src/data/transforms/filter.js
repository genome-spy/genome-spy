import FlowNode from "../flowNode.js";

export default class FilterTransform extends FlowNode {
    /**
     *
     * @param {import("../../spec/transform.js").FilterParams} params
     * @param {import("../flowNode.js").ParamMediatorProvider} paramMediatorProvider
     */
    constructor(params, paramMediatorProvider) {
        super(paramMediatorProvider);

        this.params = params;

        /** @type {import("../../view/paramMediator.js").ExprRefFunction} */
        this.predicate = undefined;
    }

    initialize() {
        this.predicate = this.paramMediator.createExpression(this.params.expr);
        this.predicate.addListener(() => this.repropagate());
    }

    /**
     *
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
        if (this.predicate(datum)) {
            this._propagate(datum);
        }
    }
}
