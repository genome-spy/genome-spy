import createFunction from "../../utils/expression";
import FlowNode from "../flowNode";

/**
 * @typedef {import("../../spec/transform").FilterParams} FilterParams
 */

export default class FilterTransform extends FlowNode {
    /**
     *
     * @param {FilterParams} filterConfig
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
