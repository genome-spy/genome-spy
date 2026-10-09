import FlowNode from "../flowNode.js";
import { isExprRef } from "../../paramRuntime/paramUtils.js";
import { field } from "../../utils/field.js";
import { asArray } from "../../utils/arrayUtils.js";

/**
 * @template T
 * @typedef {T extends import("../../spec/parameter.js").ExprRef
 *     ? import("../../paramRuntime/types.js").ExprRefFunction
 *     : () => Exclude<T, import("../../spec/parameter.js").ExprRef>} ExprRefReader<T>
 */

/**
 * @template T
 * @typedef {Extract<{
 *     [K in keyof T]-?: Extract<T[K], string | readonly (string | null)[]> extends never ? never : K
 * }[keyof T], string>} FieldProperty
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
     * Compiles a field property or array entry with its declaration location.
     * Standalone transforms without a runtime still validate field presence.
     * Callers must narrow optional, numeric, or expression alternatives first.
     * @template {object} T
     * @param {T} params
     * @param {FieldProperty<T>} property
     * @param {{ index?: number, defaultValue?: string }} [options]
     */
    createFieldAccessor(params, property, { index, defaultValue } = {}) {
        const value = params[property];
        const isArray = Array.isArray(value);
        const runtime = this.paramRuntimeProvider?.paramRuntime;
        return field(
            /** @type {string} */ (
                isArray ? value[index] : (value ?? defaultValue)
            ),
            undefined,
            runtime?.getSpecLocation(
                params,
                value == null ? [] : isArray ? [property, index] : [property]
            )
        );
    }

    /**
     * Compiles a scalar or array of field names, preserving array indices.
     * @template {object} T
     * @param {T} params
     * @param {FieldProperty<T>} property
     */
    createFieldAccessors(params, property) {
        return asArray(params[property]).map((_, index) =>
            this.createFieldAccessor(params, property, { index })
        );
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
                this.paramRuntime.watchExpression(exprRef, listener, {
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
     * @param {string | import("../../spec/parameter.js").ExprRef} expr
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
