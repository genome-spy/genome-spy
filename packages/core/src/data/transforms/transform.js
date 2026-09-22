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
     * Snapshot refreshers owned by expressions used by this transform.
     * @type {(() => void)[]}
     */
    #expressionSnapshotRefreshers = [];

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

    reset() {
        // A reset starts a new replay boundary, so no datum observes stale
        // parameter values from the preceding propagation.
        this.#refreshExpressionSnapshots();
        super.reset();
    }

    /** @param {import("../../types/flowBatch.js").FlowBatch} flowBatch */
    beginBatch(flowBatch) {
        // Sources can publish a fresh batch without resetting the dataflow.
        this.#refreshExpressionSnapshots();
        super.beginBatch(flowBatch);
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

    /**
     * Watches an expression while evaluating batch-stable parameters through a
     * plain snapshot. Passive or otherwise unknown refs retain live getters.
     *
     * @param {string} expr
     * @returns {((datum?: import("../flowNode.js").Datum) => any) & { refresh: () => void }}
     */
    watchSnapshottedExpression(expr) {
        /** @type {import("../../paramRuntime/types.js").ExprRefFunction} */
        let expression;
        /** @type {ReturnType<NonNullable<import("../../paramRuntime/types.js").ExprRefFunction["createSnapshotEvaluator"]>>} */
        let evaluator;

        expression = this.paramRuntime.watchExpression(
            expr,
            () => {
                // Make direct incoming batches observe the new value even if
                // the requested replay is delayed by debounce.
                evaluator.refresh();
                this.requestReactiveRepropagate();
            },
            {
                scopeOwned: false,
                registerDisposer: (disposer) => this.registerDisposer(disposer),
            }
        );
        evaluator = expression.createSnapshotEvaluator();
        this.#expressionSnapshotRefreshers.push(evaluator.refresh);
        return evaluator;
    }

    #refreshExpressionSnapshots() {
        for (const refresh of this.#expressionSnapshotRefreshers) refresh();
    }
}
