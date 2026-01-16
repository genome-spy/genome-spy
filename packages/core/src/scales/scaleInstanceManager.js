import { isArray } from "vega-util";

import createScale, { configureScale } from "../scale/scale.js";
import { isExprRef } from "../view/paramMediator.js";
import { isScaleLocus } from "../genome/scaleLocus.js";

export default class ScaleInstanceManager {
    /**
     * @typedef {import("../types/encoder.js").VegaScale} VegaScale
     * @typedef {VegaScale & { props: import("../spec/scale.js").Scale }} ScaleWithProps
     */

    /** @type {ScaleWithProps | undefined} */
    #scale;

    /** @type {Set<import("../view/paramMediator.js").ExprRefFunction>} */
    #rangeExprRefListeners = new Set();

    /** @type {() => import("../view/paramMediator.js").default} */
    #getParamMediator;

    /** @type {() => void} */
    #onRangeChange;

    /** @type {() => import("../genome/genomeStore.js").default | undefined} */
    #getGenomeStore;

    /**
     * @param {object} options
     * @param {() => import("../view/paramMediator.js").default} options.getParamMediator
     * @param {() => void} options.onRangeChange
     * @param {() => import("../genome/genomeStore.js").default | undefined} [options.getGenomeStore]
     */
    constructor({ getParamMediator, onRangeChange, getGenomeStore }) {
        this.#getParamMediator = getParamMediator;
        this.#onRangeChange = onRangeChange;
        this.#getGenomeStore = getGenomeStore;
    }

    get scale() {
        return this.#scale;
    }

    /**
     * @returns {import("../genome/genome.js").default}
     */
    getLocusGenome() {
        const genomeStore = this.#getGenomeStore?.();
        const genome = genomeStore?.getGenome();
        if (!genome) {
            throw new Error("No genome has been defined!");
        }
        return genome;
    }

    /**
     * @param {import("../spec/scale.js").Scale} props
     * @returns {ScaleWithProps}
     */
    createScale(props) {
        const scale = createScale({
            ...this.#stripAssembly(props),
            range: undefined,
        });
        /** @type {ScaleWithProps} */ (scale).props = props;

        if ("unknown" in scale) {
            // Never allow implicit domain construction
            scale.unknown(null);
        }

        this.#scale = /** @type {ScaleWithProps} */ (scale);
        this.#bindGenomeIfNeeded(props);
        this.#configureRange();
        this.#wrapRange();

        return this.#scale;
    }

    /**
     * @param {import("../spec/scale.js").Scale} props
     */
    #bindGenomeIfNeeded(props) {
        const scale = this.#scale;
        if (!scale || !isScaleLocus(scale)) {
            return;
        }

        const genomeStore = this.#getGenomeStore?.();
        const genome = genomeStore?.getGenome(props.assembly);
        if (!genome) {
            throw new Error("No genome has been defined!");
        }

        scale.genome(genome);
    }

    /**
     * @param {import("../spec/scale.js").Scale} props
     */
    reconfigureScale(props) {
        const scale = this.#scale;
        if (!scale || scale.type == "null") {
            return;
        }

        configureScale(
            { ...this.#stripAssembly(props), range: undefined },
            scale
        );
        scale.props = props;
        this.#configureRange();
    }

    /**
     * @param {import("../spec/scale.js").Scale} props
     * @returns {import("../spec/scale.js").Scale}
     */
    #stripAssembly(props) {
        if (!("assembly" in props)) {
            return props;
        }
        // Avoid sending non-scale properties into vega-scale.
        const { assembly: _assembly, ...rest } = props;
        void _assembly;
        return rest;
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
