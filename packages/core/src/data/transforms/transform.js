import FlowNode from "../flowNode.js";
import { isExprRef } from "../../paramRuntime/paramUtils.js";

/**
 * @template T
 * @typedef {T extends import("../../spec/parameter.js").ExprRef
 *     ? import("../../paramRuntime/types.js").ExprRefFunction
 *     : () => Exclude<T, import("../../spec/parameter.js").ExprRef>} ExprRefReader<T>
 */

export default class Transform extends FlowNode {
    /** @type {string} */
    #label;

    /**
     * @param {import("../../spec/transform.js").TransformParamsBase} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} [paramRuntimeProvider]
     */
    constructor(params, paramRuntimeProvider) {
        super(paramRuntimeProvider);
        this.#label = params.type;
    }

    /**
     * @returns {string}
     */
    get label() {
        return this.#label;
    }

    /**
     * Resolves a static value or ExprRef to a reader and owns the expression
     * subscription for the lifetime of this transform.
     *
     * @template T
     * @param {T | import("../../spec/parameter.js").ExprRef} value
     * @param {() => void} listener
     * @returns {ExprRefReader<T>}
     */
    watchExprRef(value, listener) {
        if (isExprRef(value)) {
            const exprRef =
                /** @type {import("../../spec/parameter.js").ExprRef} */ (
                    value
                );
            return /** @type {ExprRefReader<T>} */ (
                this.paramRuntime.watchExpression(exprRef.expr, listener, {
                    scopeOwned: false,
                    registerDisposer: (disposer) =>
                        this.registerDisposer(disposer),
                })
            );
        }

        return /** @type {ExprRefReader<T>} */ (() => value);
    }
}
