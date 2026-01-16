import { isArray } from "vega-util";

import createScale, { configureScale } from "../scale/scale.js";
import { isExprRef } from "./paramMediator.js";

export default class ScaleInstanceManager {
    /**
     * @typedef {import("../types/encoder.js").VegaScale} VegaScale
     * @typedef {VegaScale & { props: import("../spec/scale.js").Scale }} ScaleWithProps
     */

    /** @type {ScaleWithProps | undefined} */
    #scale;

    /** @type {Set<import("./paramMediator.js").ExprRefFunction>} */
    #rangeExprRefListeners = new Set();

    /** @type {() => import("./paramMediator.js").default} */
    #getParamMediator;

    /** @type {() => void} */
    #onRangeChange;

    /**
     * @param {object} options
     * @param {() => import("./paramMediator.js").default} options.getParamMediator
     * @param {() => void} options.onRangeChange
     */
    constructor({ getParamMediator, onRangeChange }) {
        this.#getParamMediator = getParamMediator;
        this.#onRangeChange = onRangeChange;
    }

    get scale() {
        return this.#scale;
    }

    /**
     * @param {import("../spec/scale.js").Scale} props
     * @returns {ScaleWithProps}
     */
    createScale(props) {
        const scale = createScale({ ...props, range: undefined });
        /** @type {ScaleWithProps} */ (scale).props = props;

        if ("unknown" in scale) {
            // Never allow implicit domain construction
            scale.unknown(null);
        }

        this.#scale = /** @type {ScaleWithProps} */ (scale);
        this.#configureRange();
        this.#wrapRange();

        return this.#scale;
    }

    /**
     * @param {import("../spec/scale.js").Scale} props
     */
    reconfigureScale(props) {
        const scale = this.#scale;
        if (!scale || scale.type == "null") {
            return;
        }

        configureScale({ ...props, range: undefined }, scale);
        scale.props = props;
        this.#configureRange();
    }

    /**
     * Configures range. If range is an array of expressions, they are evaluated
     * and the scale is updated when the expressions change.
     */
    #configureRange() {
        const scale = this.#scale;
        if (!scale) {
            return;
        }

        const props = scale.props;
        const range = props.range;
        this.#rangeExprRefListeners.forEach((fn) => fn.invalidate());

        if (!range || !isArray(range)) {
            // Named ranges?
            return;
        }

        /**
         * @param {T} array
         * @param {boolean} reverse
         * @returns {T}
         * @template T
         */
        const flip = (array, reverse) =>
            // @ts-ignore TODO: Fix the type (should be a generic union array type)
            reverse ? array.slice().reverse() : array;

        if (range.some(isExprRef)) {
            /** @type {(() => void)[]} */
            let expressions;

            const evaluateAndSet = () => {
                scale.range(
                    flip(
                        expressions.map((expr) => expr()),
                        props.reverse
                    )
                );
            };

            expressions = range.map((elem) => {
                if (isExprRef(elem)) {
                    const fn = this.#getParamMediator().createExpression(
                        elem.expr
                    );
                    fn.addListener(evaluateAndSet);
                    this.#rangeExprRefListeners.add(fn);
                    return () => fn(null);
                } else {
                    return () => elem;
                }
            });

            evaluateAndSet();
        } else {
            scale.range(flip(range, props.reverse));
        }
    }

    #wrapRange() {
        const scale = this.#scale;
        const range = scale?.range;
        if (!range) {
            return;
        }

        const notify = () => this.#onRangeChange();
        scale.range = /** @type {any} */ (
            function (/** @type {any} */ _) {
                if (arguments.length) {
                    range(_);
                    notify();
                } else {
                    return range();
                }
            }
        );

        // The initial setting
        notify();
    }
}
