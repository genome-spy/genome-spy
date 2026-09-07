import { isDiscrete } from "vega-scale";
import createIndexer from "../utils/indexer.js";
import { NominalDomain } from "../utils/domainArray.js";
import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import { shallowArrayEquals } from "../utils/arrayUtils.js";

import createScale, {
    configureScaleProperties,
    configureScaleRange,
    configureDomain,
} from "../scale/scale.js";
import { isExprRef } from "../paramRuntime/paramUtils.js";
import { isScaleLocus } from "../genome/scaleLocus.js";

/**
 * @typedef {{
 *   scale: import("../types/encoder.js").VegaScale,
 *   props: import("../spec/scale.js").Scale,
 *   domain: readonly any[],
 *   configuredRange: any[] | undefined,
 *   range: any[] | undefined,
 *   prepared: (import("../types/encoder.js").VegaScale & {props: import("../spec/scale.js").Scale}) | undefined
 * }} MappingConfiguration
 */

export default class ScaleInstanceManager {
    /**
     * @typedef {import("../types/encoder.js").VegaScale} VegaScale
     * @typedef {VegaScale & { props: import("../spec/scale.js").Scale }} ScaleWithProps
     */

    /** @type {ScaleWithProps | undefined} */
    #scale;

    /** @type {any[] | undefined} */
    #defaultRange;

    /** @type {ViewParamRuntime} */
    #runtime;

    /** @type {() => ViewParamRuntime} */
    #getRuntime;

    /** @type {import("../paramRuntime/types.js").ParamRef<readonly any[]>} */
    #domain;

    /** @type {import("../paramRuntime/types.js").OperationRef<MappingConfiguration | null>} */
    mapping;

    /** @type {import("../paramRuntime/types.js").WritableParamRef<{ range: any[], configuredRange: any[] | undefined, props: import("../spec/scale.js").Scale } | null>} */
    #rangeCommand;

    // A public range command is invalidated by the first reactive range change.
    #rangeCommandActive = false;

    /** @type {(range: any[]) => void} */
    #setRange;

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
     * @param {() => ViewParamRuntime} options.getRuntime
     * @param {(expr: string) => import("../paramRuntime/types.js").ExprRefFunction} options.createExpression
     * @param {() => void} options.onRangeChange
     * @param {(domain: any[]) => void} options.onDomainChange
     * @param {() => import("../genome/genomeStore.js").default | undefined} options.getGenomeStore
     */
    constructor({
        getRuntime,
        createExpression,
        onRangeChange,
        onDomainChange,
        getGenomeStore,
    }) {
        this.#getRuntime = getRuntime;
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
        this.#rangeCommandActive = false;
        this.#rangeCommand?.set(null);
        this.#scale = undefined;
        this.#setRange = undefined;
        this.#mirrorDomain = undefined;
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
     * @param {(domain: any[]) => import("../paramRuntime/types.js").ParamRef<readonly any[]>} initializeDomain Before range expressions bind.
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
        if (scale.type !== "null")
            this.#domain = initializeDomain(scale.domain());
        this.#setRange = scale.range;
        if (!this.#runtime) {
            this.#runtime = new ViewParamRuntime(() => this.#getRuntime());
            this.#rangeCommand = this.#runtime.signal("range command", null);
            this.mapping = this.#runtime.operation(
                "scale mapping",
                [],
                /** @returns {MappingConfiguration | null} */ () => null,
                (configuration) => {
                    if (configuration) this.#applyMapping(configuration);
                },
                { equals: equalMapping }
            );
            // If profiling shows range() expressions are hot during domain animation,
            // expose a range-only dependency instead of making them follow mapping.
            this.#runtime.effect([this.mapping], this.#onRangeChange);
        }
        this.#initializingRange = true;
        try {
            this.configureMapping(props);
            this.#runtime.flushNow();
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
        this.#scale.props = props;
    }

    /** @param {import("../spec/scale.js").Scale} props */
    configureMapping(props) {
        const scale = this.#scale;
        const dependencies =
            scale.type === "null" ? [] : [this.#domain, this.#rangeCommand];
        /** @param {any} value */
        const bind = (value) => {
            if (!isExprRef(value)) return () => value;
            const expression = this.#createExpression(value.expr);
            dependencies.push(...expression.dependencies);
            return expression;
        };
        const expressions = Array.isArray(props.range)
            ? props.range.map(bind)
            : undefined;
        // Expressions may bootstrap parameters that reference this scale. Once
        // bound, graph cycle checks guard feedback and observers can read mapping.
        this.#initializingRange = false;
        this.mapping.rebind(dependencies, () => {
            const configuredRange = expressions?.map((expression) =>
                expression(null)
            );
            if (props.reverse) configuredRange?.reverse();
            const command = this.#rangeCommand.get();
            const canUseCommand =
                this.#rangeCommandActive &&
                command !== null &&
                command.props === props &&
                equalRange(command.configuredRange, configuredRange);
            if (command && !canUseCommand) this.#rangeCommandActive = false;
            const range =
                command && canUseCommand ? command.range : configuredRange;
            const previous = this.mapping.get();
            const prepared =
                scale.type === "null" ||
                (previous?.scale === scale && previous?.props === props)
                    ? undefined
                    : this.#prepareMapping(props);
            return {
                scale,
                props,
                domain: scale.type === "null" ? [] : this.#domain.get(),
                configuredRange,
                range,
                prepared,
            };
        });
        this.#runtime.flushNow({ afterTransaction: true });
    }

    /** Validate configuration once and retain its properties for live application.
     * @param {import("../spec/scale.js").Scale} props
     */
    #prepareMapping(props) {
        props = this.#stripNonScaleProps(props);
        const working = this.#scale.copy();
        working.type = this.#scale.type;
        configureScaleProperties(working, props);
        configureScaleRange(working, {
            ...props,
            range: undefined,
        });
        return Object.assign(working, { props });
    }

    /** @param {MappingConfiguration} configuration */
    #applyMapping({ props, range, prepared }) {
        // Reset can leave a queued update behind while scale recreation fails.
        if (!this.#scale || this.#scale.type === "null") return;
        if (prepared) {
            configureScaleProperties(this.#scale, prepared.props);
            // Copy through raw setters; public setters submit reactive commands.
            // Restore the interpolator last: range() replaces color schemes.
            if (this.#setRange) this.#setRange(prepared.range());
            if ("interpolator" in prepared && "interpolator" in this.#scale)
                this.#scale.interpolator(prepared.interpolator());
            if ("bins" in prepared)
                /** @type {any} */ (this.#scale).bins = prepared.bins;
            else delete (/** @type {any} */ (this.#scale).bins);
        }
        if (range) this.#setRange(range);
        else if (
            props.scheme === undefined &&
            !("rangeStep" in props) &&
            this.#defaultRange
        ) {
            this.#setRange(this.#defaultRange);
        }
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

    #wrapScaleInterceptors() {
        // Public mutation compatibility (including App sample layout). Internal
        // configuration uses the original setters and publishes through mapping.
        const scale = this.#scale;
        const range = scale.range;
        const domain = scale.domain;
        const setRange = (/** @type {any[]} */ values) => {
            const configuration = this.mapping.get();
            this.#rangeCommandActive = true;
            this.#rangeCommand.set({
                range: Array.from(values),
                configuredRange: configuration.configuredRange,
                props: configuration.props,
            });
            this.#runtime.flushNow({ afterTransaction: true });
        };
        const updateDomain = this.#onDomainChange;

        if (typeof range === "function") {
            scale.range = /** @type {any} */ (
                function (/** @type {any} */ _) {
                    if (arguments.length) {
                        setRange(_);
                        return scale;
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
    }

    dispose() {
        this.#runtime?.dispose();
    }
}

/** @param {any[] | undefined} a @param {any[] | undefined} b */
function equalRange(a, b) {
    return a === b || (!!a && !!b && shallowArrayEquals(a, b));
}

/** @param {MappingConfiguration | null} a @param {MappingConfiguration | null} b */
function equalMapping(a, b) {
    return (
        a === b ||
        (!!a &&
            !!b &&
            a.scale === b.scale &&
            a.props === b.props &&
            shallowArrayEquals(a.domain, b.domain) &&
            equalRange(a.configuredRange, b.configuredRange) &&
            equalRange(a.range, b.range))
    );
}
