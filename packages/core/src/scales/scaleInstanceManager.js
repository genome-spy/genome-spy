import { isArray } from "vega-util";

import createScale, { configureScale } from "../scale/scale.js";
import { isExprRef } from "../paramRuntime/paramUtils.js";
import { isScaleLocus } from "../genome/scaleLocus.js";

export default class ScaleInstanceManager {
    /**
     * @typedef {import("../types/encoder.js").VegaScale} VegaScale
     * @typedef {VegaScale & { props: import("../spec/scale.js").Scale }} ScaleWithProps
     */

    /** @type {ScaleWithProps | undefined} */
    #scale;

    /** @type {Set<import("../paramRuntime/types.js").ExprRefFunction>} */
    #rangeExprRefListeners = new Set();

    /** @type {() => { createExpression: (expr: string) => import("../paramRuntime/types.js").ExprRefFunction }} */
    #getParamRuntime;

    /** @type {() => void} */
    #onRangeChange;

    /** @type {() => void} */
    #onDomainChange;

    /** @type {() => import("../genome/genomeStore.js").default | undefined} */
    #getGenomeStore;

    #domainNotificationsSuspended = 0;

    /**
     * @param {object} options
     * @param {() => { createExpression: (expr: string) => import("../paramRuntime/types.js").ExprRefFunction }} options.getParamRuntime
     * @param {() => void} options.onRangeChange
     * @param {() => void} [options.onDomainChange]
     * @param {() => import("../genome/genomeStore.js").default | undefined} [options.getGenomeStore]
     */
    constructor({
        getParamRuntime,
        onRangeChange,
        onDomainChange,
        getGenomeStore,
    }) {
        this.#getParamRuntime = getParamRuntime;
        this.#onRangeChange = onRangeChange;
        this.#onDomainChange = onDomainChange;
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
            ...this.#stripNonScaleProps(props),
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
        this.#wrapScaleInterceptors();

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
            { ...this.#stripNonScaleProps(props), range: undefined },
            scale
        );
        scale.props = props;
        this.#configureRange();
    }

    /**
     * @param {() => void} callback
     * @returns {void}
     */
    withDomainNotificationsSuppressed(callback) {
        this.#domainNotificationsSuspended += 1;
        try {
            callback();
        } finally {
            this.#domainNotificationsSuspended -= 1;
        }
    }

    /**
     * @param {import("../spec/scale.js").Scale} props
     * @returns {import("../spec/scale.js").Scale}
     */
    #stripNonScaleProps(props) {
        // Avoid sending non-scale properties into vega-scale.
        // Strip internal runtime-only props before passing into vega-scale.
        const propsAny = /** @type {any} */ (props);
        const {
            assembly: _assembly,
            domainIndexer: _domainIndexer,
            ...rest
        } = propsAny;
        void _assembly;
        void _domainIndexer;
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
        this.#rangeExprRefListeners.forEach((fn) => fn.invalidate());

        const resolved = resolveRange({
            range: props.range,
            reverse: props.reverse,
            createExpression: (expr) =>
                this.#getParamRuntime().createExpression(expr),
            registerExpr: (fn) => this.#rangeExprRefListeners.add(fn),
        });

        if (!resolved) {
            // Named ranges?
            return;
        }

        if ("values" in resolved) {
            scale.range(/** @type {any[]} */ (resolved.values));
            return;
        }

        const apply = () => scale.range(resolved.evaluate());
        resolved.setup(apply);
        apply();
    }

    #wrapScaleInterceptors() {
        const scale = this.#scale;
        if (!scale) {
            return;
        }

        const range = scale.range;
        const domain = scale.domain;
        const notifyRange = () => this.#onRangeChange?.();
        const notifyDomain = () => {
            if (this.#domainNotificationsSuspended > 0) {
                return;
            }
            this.#onDomainChange?.();
        };

        withScaleInterceptors(scale, {
            onRangeChange: notifyRange,
            onDomainChange: notifyDomain,
            range,
            domain,
        });

        notifyRange();
    }
}

/**
 * @param {import("../types/encoder.js").VegaScale} scale
 * @param {object} options
 * @param {(value: any) => void} [options.onRangeChange]
 * @param {(value: any) => void} [options.onDomainChange]
 * @param {(value?: any) => any} options.range
 * @param {(value?: any) => any} options.domain
 */
function withScaleInterceptors(
    scale,
    { onRangeChange, onDomainChange, range, domain }
) {
    if (typeof range === "function") {
        scale.range = /** @type {any} */ (
            function (/** @type {any} */ _) {
                if (arguments.length) {
                    range(_);
                    onRangeChange?.();
                } else {
                    return range();
                }
            }
        );
    }

    if (typeof domain === "function") {
        scale.domain = /** @type {any} */ (
            function (/** @type {any} */ _) {
                if (arguments.length) {
                    domain(_);
                    onDomainChange?.();
                } else {
                    return domain();
                }
            }
        );
    }
}

/**
 * @param {object} options
 * @param {import("../spec/scale.js").Scale["range"]} options.range
 * @param {boolean | undefined} options.reverse
 * @param {(expr: string) => import("../paramRuntime/types.js").ExprRefFunction} options.createExpression
 * @param {(fn: import("../paramRuntime/types.js").ExprRefFunction) => void} options.registerExpr
 * @returns {{
 *   dynamic: true,
 *   evaluate: () => any[],
 *   setup: (listener: () => void) => void
 * } | {
 *   dynamic: false,
 *   values: any[]
 * } | null}
 */
function resolveRange({ range, reverse, createExpression, registerExpr }) {
    if (!range || !isArray(range)) {
        return null;
    }

    /**
     * @param {T} array
     * @param {boolean} reverseFlag
     * @returns {T}
     * @template T
     */
    const flip = (array, reverseFlag) =>
        // @ts-ignore TODO: Fix the type (should be a generic union array type)
        reverseFlag ? array.slice().reverse() : array;

    if (range.some(isExprRef)) {
        /** @type {(() => any)[]} */
        let expressions;
        const evaluate = () =>
            flip(
                expressions.map((expr) => expr()),
                reverse
            );
        const setup = (/** @type {() => void} */ listener) => {
            expressions = range.map((elem) => {
                if (isExprRef(elem)) {
                    const fn = createExpression(elem.expr);
                    fn.addListener(listener);
                    registerExpr(fn);
                    return () => fn(null);
                }
                return () => elem;
            });
        };

        return { dynamic: true, evaluate, setup };
    }

    return {
        dynamic: false,
        values: flip(range, reverse),
    };
}
