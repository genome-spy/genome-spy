import createFunction from "../../utils/expression";
import FlowNode, { BEHAVIOR_MODIFIES } from "../flowNode";

/**
 * @typedef {import("../../spec/transform").FormulaParams} FormulaParams
 */

export default class FormulaTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     *
     * @param {FormulaParams} config
     */
    constructor(config) {
        super();

        this.fn = createFunction(config.expr);
        this.as = config.as;
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
