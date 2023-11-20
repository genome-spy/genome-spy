import createFunction from "../../utils/expression.js";
import FlowNode, { BEHAVIOR_MODIFIES } from "../flowNode.js";

export default class FormulaTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     *
     * @param {import("../../spec/transform.js").FormulaParams} params
     */
    constructor(params) {
        super();
        this.params = params;

        this.as = params.as;

        /** @type {(datum: any) => any} */
        this.fn = undefined;
    }

    initialize() {
        this.fn = createFunction(this.params.expr, this.getGlobalObject());
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
