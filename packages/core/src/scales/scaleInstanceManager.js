import { isDiscrete } from "vega-scale";
import createIndexer from "../utils/indexer.js";
import { NominalDomain } from "../utils/domainArray.js";
import { isArray } from "vega-util";

import createScale, {
    configureScaleProperties,
    configureScaleRange,
    configureDomain,
} from "../scale/scale.js";
import { isExprRef } from "../paramRuntime/paramUtils.js";
import { isScaleLocus } from "../genome/scaleLocus.js";

export default class ScaleInstanceManager {
    /**
     * @typedef {import("../types/encoder.js").VegaScale} VegaScale
     * @typedef {VegaScale & { props: import("../spec/scale.js").Scale }} ScaleWithProps
     */

    /** @type {ScaleWithProps | undefined} */
    #scale;

    /** @type {any[] | undefined} */
    #defaultRange;

    /** @type {Set<import("../paramRuntime/types.js").ExprRefFunction>} */
    #rangeExprRefListeners = new Set();

    /** @type {(expr: string) => import("../paramRuntime/types.js").ExprRefFunction} */
    #createExpression;

    /** @type {() => void} */
    #onRangeChange;

    /** @type {(domain: any[]) => void} */
    #onDomainChange;

    /** @type {(domain: any[]) => void} */
    #mirrorDomain;

    /** @type {() => import("../genome/genomeStore.js").default | undefined} */
    #getGenomeStore;

    #initializingRange = false;

    /** @type {ReturnType<typeof createIndexer> | undefined} */
    #categoricalIndexer;

    /** @type {VegaScale | undefined} */
    #domainNormalizer;

    /**
     * @param {object} options
     * @param {(expr: string) => import("../paramRuntime/types.js").ExprRefFunction} options.createExpression
     * @param {() => void} options.onRangeChange
     * @param {(domain: any[]) => void} options.onDomainChange
     * @param {() => import("../genome/genomeStore.js").default | undefined} options.getGenomeStore
     */
    constructor({
        createExpression,
        onRangeChange,
        onDomainChange,
        getGenomeStore,
    }) {
        this.#createExpression = createExpression;
        this.#onRangeChange = onRangeChange;
        this.#onDomainChange = onDomainChange;
        this.#getGenomeStore = getGenomeStore;
    }

    get scale() {
        return this.#scale;
    }

    get initializingRange() {
        return this.#initializingRange;
    }

    resetScale() {
        this.dispose();
        this.#scale = undefined;
        this.#domainNormalizer = undefined;
        this.#defaultRange = undefined;
    }

    /**
     * @param {import("../spec/scale.js").Scale["assembly"]} [assembly]
     * @returns {import("../genome/genome.js").default}
     */
    getLocusGenome(assembly) {
        const genomeStore = this.#getGenomeStore();
        if (!genomeStore) {
            throw new Error("No genome has been defined!");
        }

        if (assembly) {
            return genomeStore.getGenome(assembly);
        }

        return genomeStore.getGenome();
    }

    /**
     * @param {import("../spec/scale.js").Scale} props
     * @param {(domain: any[]) => void} initializeDomain Before range expressions bind.
     * @returns {ScaleWithProps}
     */
    createScale(props, initializeDomain) {
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
        this.#defaultRange =
            typeof scale.range === "function" ? scale.range() : undefined;
        this.#bindGenomeIfNeeded(props);
        this.#mirrorDomain = scale.domain;
        if (scale.type !== "null") {
            initializeDomain(scale.domain());
        }
        this.#initializingRange = true;
        try {
            this.#configureRange();
        } finally {
            this.#initializingRange = false;
        }
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

        scale.genome(this.getLocusGenome(props.assembly));
    }

    /**
     * Attach an inferred domain and stable categorical mapping to resolved props.
     * Used at bootstrap and on source publication, never during animation frames.
     * @param {import("../spec/scale.js").Scale} props
     * @param {any[] | undefined} domain
     * @param {boolean} explicit
     */
    domainProps(props, domain, explicit) {
        const result = { ...props };
        if (isDiscrete(props.type)) {
            // Intern IDs belong to retained GPU data, independently of display order.
            // Reordering an explicit domain must not renumber already encoded rows.
            const indexer = (this.#categoricalIndexer ??= createIndexer());
            indexer.addAll(domain ?? []);
            const active = domain && new Set(domain);
            // TODO: Enable dynamic explicit categorical reordering/removal as a
            // supported feature once WebGL is retired. This domain/ID separation
            // and webgpu-renderer already support it; WebGL's range-texture mapping
            // does not. Stable IDs remain necessary for retained WebGPU series.
            const values = explicit
                ? (domain ?? [])
                : indexer
                      .domain()
                      .filter((value) => !active || active.has(value));
            result.domain = values.length
                ? /** @type {any[]} */ (values)
                : new NominalDomain();
            /** @type {any} */ (result).domainIndexer = indexer;
        } else if (domain?.length) {
            result.domain = domain;
        }
        if (!result.domain && result.domainMid !== undefined) {
            result.domain = [result.domainMin ?? 0, result.domainMax ?? 1];
        }
        return result;
    }

    /**
     * Normalize with final properties on a copy, before any live mutation.
     * @param {import("../spec/scale.js").Scale} props
     */
    prepareDomain(props) {
        const working = this.#scale.copy();
        working.type = this.#scale.type;
        configureScaleProperties(working, this.#stripNonScaleProps(props));
        return configureDomain(working, props);
    }

    /** @param {import("../spec/scale.js").Scale} props */
    configureProperties(props) {
        this.#domainNormalizer = undefined;
        configureScaleProperties(this.#scale, this.#stripNonScaleProps(props));
        this.#scale.props = props;
    }

    /** @param {import("../spec/scale.js").Scale} props */
    configureRange(props) {
        // TODO(#463): Apply reactive properties/range as one settled mapping
        // update, replacing the separate subscriptions and range notifications.
        // Keep displayed-domain dependencies distinct so same-scale domain-to-range
        // expressions and frame-by-frame calibration remain valid.
        configureScaleRange(this.#scale, {
            ...this.#stripNonScaleProps(props),
            range: undefined,
        });
        this.#configureRange();
    }

    /**
     * Reuse a setter-only copy so normalization does not allocate a scale per frame.
     * @param {readonly any[]} domain
     * @returns {any[]}
     */
    normalizeDomain(domain) {
        this.#domainNormalizer ??= this.#scale.copy();
        this.#domainNormalizer.domain(Array.from(domain));
        return this.#domainNormalizer.domain();
    }

    /** Exact internal-domain mirror; never publishes an event itself.
     * @param {readonly any[]} domain
     */
    mirrorDomain(domain) {
        this.#mirrorDomain(Array.from(domain));
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
        this.#rangeExprRefListeners.clear();

        const resolved = resolveRange({
            range: props.range,
            reverse: props.reverse,
            createExpression: this.#createExpression,
            registerExpr: (fn) => this.#rangeExprRefListeners.add(fn),
        });

        if (!resolved) {
            if (
                props.scheme === undefined &&
                !("rangeStep" in props) &&
                this.#defaultRange
            ) {
                scale.range(this.#defaultRange);
            }
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
        // TODO(#463): When mapping configuration joins the reactive graph, keep
        // the mutable D3 scale internal and replace these patches with an explicit
        // configuration API. Methods such as nice() can bypass domain interception.
        // Preserve a cached fast mapping function for encoders; benchmark any
        // callable wrapper/proxy before putting it on the per-datum path.
        const scale = this.#scale;
        const range = scale.range;
        const domain = scale.domain;
        const notifyRange = this.#onRangeChange;
        const updateDomain = this.#onDomainChange;

        if (typeof range === "function") {
            scale.range = /** @type {any} */ (
                function (/** @type {any} */ _) {
                    if (arguments.length) {
                        range(_);
                        notifyRange();
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
                        updateDomain(Array.from(_));
                        return scale;
                    } else {
                        return domain();
                    }
                }
            );
        }
        notifyRange();
    }

    dispose() {
        this.#rangeExprRefListeners.forEach((fn) => fn.invalidate());
        this.#rangeExprRefListeners.clear();
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
                    fn.subscribe(listener);
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
