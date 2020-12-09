import createFunction from "../../utils/expression";
import FlowNode, { BEHAVIOR_MODIFIES } from "../flowNode";

/**
 * @typedef {import("../../spec/transform").FormulaConfig} FormulaConfig
 */

export default class FormulaTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     *
     * @param {FormulaConfig} config
     */
    constructor(config) {
        super();

        this.fn = createFunction(config.expr);
        this.as = config.as;
    }

    /**
     *
     * @param {any} datum
     */
    handle(datum) {
        datum[this.as] = this.fn(datum);
        this._propagate(datum);
    }
}
