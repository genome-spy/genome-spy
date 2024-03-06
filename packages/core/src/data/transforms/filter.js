import { makeSelectionTestExpression } from "../../selection/selection.js";
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
        let expression = "";

        if (isExprFilterParams(this.params)) {
            expression = this.params.expr;
        } else if (isSelectionFilterParams(this.params)) {
            expression = makeSelectionTestExpression(this.params);
        } else {
            throw new Error(
                "Invalid filter params: " + JSON.stringify(this.params)
            );
        }

        this.predicate = this.paramMediator.createExpression(expression);
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

/**
 * @param {import("../../spec/transform.js").FilterParams} params
 * @returns {params is import("../../spec/transform.js").ExprFilterParams}
 */
export function isExprFilterParams(params) {
    return "expr" in params;
}

/**
 * @param {import("../../spec/transform.js").FilterParams} params
 * @returns {params is import("../../spec/transform.js").SelectionFilterParams}
 */
export function isSelectionFilterParams(params) {
    return "param" in params;
}
