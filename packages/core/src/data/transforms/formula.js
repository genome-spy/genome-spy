import createFunction from "../../utils/expression";
import FlowNode, { BEHAVIOR_MODIFIES } from "../flowNode";

export default class FormulaTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     *
     * @param {import("../../spec/transform").FormulaParams} params
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
     * @param {import("../flowNode").Datum} datum
     */
    handle(datum) {
        datum[this.as] = this.fn(datum);
        this._propagate(datum);
    }
}
