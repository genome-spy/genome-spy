import createFunction from "../../utils/expression";
import FlowNode from "../flow/flowNode";

/**
 * @typedef {import("../../spec/transform").FilterConfig} FilterConfig
 */

export default class FilterTransform extends FlowNode {
    /**
     *
     * @param {FilterConfig} filterConfig
     */
    constructor(filterConfig) {
        super();

        this.predicate = createFunction(filterConfig.expr);
    }

    /**
     *
     * @param {any} datum
     */
    handle(datum) {
        if (this.predicate(datum)) {
            this._propagate(datum);
        }
    }
}
