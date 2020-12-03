import createFunction from "../../utils/expression";
import FlowNode from "../flow/flowNode";

/**
 * @typedef {import("../../spec/transform").FormulaConfig} FormulaConfig
 */

export default class FormulaTransform extends FlowNode {
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
        const copy = Object.assign({}, datum);
        copy[this.as] = this.fn(datum);
        this._propagate(copy);
    }
}
