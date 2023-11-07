import createFunction from "../../utils/expression.js";
import FlowNode from "../flowNode.js";

export default class FilterTransform extends FlowNode {
    /**
     *
     * @param {import("../../spec/transform").FilterParams} params
     */
    constructor(params) {
        super();
        this.params = params;

        /** @type {(datum: any) => boolean} */
        this.predicate = undefined;
    }

    initialize() {
        this.predicate = createFunction(
            this.params.expr,
            this.getGlobalObject()
        );
    }

    /**
     *
     * @param {import("../flowNode").Datum} datum
     */
    handle(datum) {
        if (this.predicate(datum)) {
            this._propagate(datum);
        }
    }
}
