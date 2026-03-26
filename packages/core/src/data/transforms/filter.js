import { makeSelectionTestExpression } from "../../selection/selection.js";
import Transform from "./transform.js";

export default class FilterTransform extends Transform {
    /**
     *
     * @param {import("../../spec/transform.js").FilterParams} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} paramRuntimeProvider
     */
    constructor(params, paramRuntimeProvider) {
        super(params, paramRuntimeProvider);

        this.params = params;

        /** @type {import("../../paramRuntime/types.js").ExprRefFunction} */
        this.predicate = undefined;

        /** @type {boolean} */
        this.constantExpression = false;

        /** @type {boolean} */
        this.constantPredicate = false;
    }

    initialize() {
        let expression;

        if (isExprFilterParams(this.params)) {
            expression = this.params.expr;
        } else if (isSelectionFilterParams(this.params)) {
            const selection = this.paramRuntime.findValue(this.params.param);
            if (!selection) {
                throw new Error(
                    `Cannot initialize filter transform. Selection parameter "${this.params.param}" not found!`
                );
            }
            expression = makeSelectionTestExpression(this.params, selection);
        } else {
            throw new Error(
                "Invalid filter params: " + JSON.stringify(this.params)
            );
        }

        this.predicate = this.paramRuntime.watchExpression(
            expression,
            () => {
                if (this.constantExpression) {
                    this.constantPredicate = !!this.predicate(null);
                }
                this.repropagate();
            },
            {
                scopeOwned: false,
                registerDisposer: (disposer) => this.registerDisposer(disposer),
            }
        );

        // Datum-invariant predicates can be cached until a reactive input changes.
        this.constantExpression =
            this.predicate.fields.length === 0 &&
            this.predicate.deterministic !== false;
        if (this.constantExpression) {
            this.constantPredicate = !!this.predicate(null);
        }
    }

    /**
     *
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
        if (
            this.constantExpression
                ? this.constantPredicate
                : this.predicate(datum)
        ) {
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
