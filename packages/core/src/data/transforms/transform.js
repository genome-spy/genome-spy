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

    /** @type {number | undefined} */
    #replayDebounce;

    #reactiveRevision = 0;

    #consumedReactiveRevision = 0;

    /** @type {ReturnType<typeof setTimeout> | undefined} */
    #replayTimeout;

    /**
     * @param {import("../../spec/transform.js").TransformParamsBase} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} [paramRuntimeProvider]
     */
    constructor(params, paramRuntimeProvider) {
        super(paramRuntimeProvider);
        this.#label = params.type;

        const debounce =
            /** @type {import("../../spec/transform.js").ReactiveTransformParams} */ (
                params
            ).debounce;
        if (debounce !== undefined) {
            if (!Number.isFinite(debounce) || debounce < 0) {
                throw new Error(
                    `The debounce for the ${params.type} transform must be a non-negative finite number.`
                );
            }
            this.#replayDebounce = debounce;
            this.registerDisposer(() => clearTimeout(this.#replayTimeout));
        }
    }

    complete() {
        // Capture before child completion: downstream domain updates can
        // invalidate the expression and must remain eligible for replay.
        const consumedRevision = this.#reactiveRevision;
        super.complete();
        this.#consumedReactiveRevision = consumedRevision;

        if (consumedRevision == this.#reactiveRevision) {
            clearTimeout(this.#replayTimeout);
            this.#replayTimeout = undefined;
        }
    }

    /**
     * Requests replay after an expression dependency changes. A configured
     * debounce delays only cached replay; incoming batches continue to use the
     * current expression value and can satisfy the pending revision.
     * @protected
     */
    requestReactiveRepropagate() {
        this.#reactiveRevision++;

        if (this.#replayDebounce === undefined) {
            this.requestRepropagate();
            return;
        }

        clearTimeout(this.#replayTimeout);
        this.#replayTimeout = undefined;
        if (this.completed) {
            this.#replayTimeout = setTimeout(
                this.#publishPendingReactiveRevision,
                this.#replayDebounce
            );
        }
    }

    #publishPendingReactiveRevision = () => {
        this.#replayTimeout = undefined;
        if (
            !this.disposed &&
            this.completed &&
            this.#consumedReactiveRevision != this.#reactiveRevision
        ) {
            this.requestRepropagate();
            this.paramRuntime.flushNow();
        }
    };

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
