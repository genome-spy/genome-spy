import deepEqual from "../utils/deepEqual.js";
import { isDiscrete } from "vega-scale";
import { color } from "d3-color";
import { isColorChannel } from "../encoder/encoder.js";
import createIndexer from "../utils/indexer.js";
import { NominalDomain } from "../utils/domainArray.js";
import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import { shallowArrayEquals } from "../utils/arrayUtils.js";
import { normalizeBandScaleProperty } from "./bandScaleProperties.js";
import { isScalar } from "../utils/variableTools.js";

import createScale, {
    configureScaleProperties,
    configureScaleRange,
    applyScaleDomain,
    getScalePropertyDefaults,
} from "../scale/scale.js";
import { isExprRef } from "../paramRuntime/paramUtils.js";
import { isScaleLocus } from "../genome/scaleLocus.js";
import {
    hasGroupingGaps,
    normalizeGapPositions,
} from "../genome/indexGapMapping.js";

const MANAGED_SCALE_PROPERTIES = /** @type {const} */ ([
    "assembly",
    "domainIndexer",
    "gapPositions",
    "gapWidth",
    "viewport",
]);

/**
 * @typedef {{
 *   scale: import("../types/encoder.js").VegaScale,
 *   props: import("../spec/scale.js").Scale,
 *   padding: [number, number] | undefined,
 *   domain: readonly any[],
 *   gapDomain: readonly number[] | undefined,
 *   viewport: import("./scaleBand.js").CategoricalViewport | null | undefined,
 *   gapPositions: readonly number[],
 *   gapWidth: number | null,
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

    /** @type {import("../spec/channel.js").Channel} */
    #channel;

    /** @type {any[] | undefined} */
    #defaultRange;

    /** @type {ViewParamRuntime} */
    #runtime;

    /** @type {() => ViewParamRuntime} */
    #getRuntime;

    /** @type {import("../paramRuntime/types.js").ParamRef<Pick<import("./domainLifecycle.js").DomainState, "visibleDomain" | "gapDomain" | "viewport">>} */
    #domainState;

    /** @type {import("../paramRuntime/types.js").OperationRef<MappingConfiguration | null>} */
    mapping;

    /** @type {(expr: import("../spec/parameter.js").ExprRef, layoutProperty?: string) => import("../paramRuntime/types.js").ExprRefFunction} */
    #createExpression;

    /** @type {() => void} */
    #onRangeChange;

    /** @type {(domain: any[]) => void} */
    #onDomainChange;

    /** @type {(domain: any[], ranks?: readonly number[]) => void} */
    #mirrorDomain;

    /** @type {(viewport: import("./scaleBand.js").CategoricalViewport | null) => void} */
    #mirrorViewport;

    /** @type {(viewport: import("./scaleBand.js").CategoricalViewport | null) => void} */
    #onViewportChange;

    /** @type {() => import("../genome/genomeStore.js").default | undefined} */
    #getGenomeStore;

    /** @type {() => number} */
    #getAxisLength;

    #initializingRange = false;

    /** @type {ReturnType<typeof createIndexer> | undefined} */
    #categoricalIndexer;

    /** @type {VegaScale | undefined} */
    #domainNormalizer;

    /**
     * @param {object} options
     * @param {import("../spec/channel.js").Channel} options.channel
     * @param {() => ViewParamRuntime} options.getRuntime
     * @param {(expr: import("../spec/parameter.js").ExprRef, layoutProperty?: string) => import("../paramRuntime/types.js").ExprRefFunction} options.createExpression
     * @param {() => void} options.onRangeChange
     * @param {(domain: any[]) => void} options.onDomainChange
     * @param {(viewport: import("./scaleBand.js").CategoricalViewport | null) => void} [options.onViewportChange]
     * @param {() => import("../genome/genomeStore.js").default | undefined} options.getGenomeStore
     * @param {() => number} [options.getAxisLength]
     */
    constructor({
        channel,
        getRuntime,
        createExpression,
        onRangeChange,
        onDomainChange,
        onViewportChange = () => {
            throw new Error("Viewport commands are not configured.");
        },
        getGenomeStore,
        getAxisLength = () => 0,
    }) {
        this.#channel = channel;
        this.#getRuntime = getRuntime;
        this.#createExpression = createExpression;
        this.#onRangeChange = onRangeChange;
        this.#onDomainChange = onDomainChange;
        this.#onViewportChange = onViewportChange;
        this.#getGenomeStore = getGenomeStore;
        this.#getAxisLength = getAxisLength;
    }

    get scale() {
        return this.#scale;
    }

    get initializingRange() {
        return this.#initializingRange;
    }

    resetScale() {
        this.#scale = undefined;
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
     * @param {(domain: any[]) => import("../paramRuntime/types.js").ParamRef<Pick<import("./domainLifecycle.js").DomainState, "visibleDomain" | "gapDomain" | "viewport">>} initializeDomain Before range expressions bind.
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
        if ("axisLength" in scale)
            /** @type {import("../genome/scaleIndex.js").ScaleIndex} */ (
                scale
            ).axisLength(this.#getAxisLength);
        this.#mirrorDomain = scale.domain;
        if ("viewport" in scale) {
            const categorical =
                /** @type {import("./scaleBand.js").CategoricalGapScale} */ (
                    scale
                );
            this.#mirrorViewport = categorical.viewport;
            this.#mirrorViewport(
                props.viewport ? { interval: props.viewport } : null
            );
        }
        if (scale.type !== "null")
            this.#domainState = initializeDomain(scale.domain());
        if (!this.#runtime) {
            this.#runtime = new ViewParamRuntime(() => this.#getRuntime());
            this.mapping = this.#runtime.operation(
                "scale mapping",
                [],
                /** @returns {MappingConfiguration | null} */ () => null,
                (configuration) => {
                    if (configuration) this.#applyMapping(configuration);
                },
                { equals: equalMapping }
            );
            let previous = this.mapping.get();
            this.#runtime.effect([this.mapping], () => {
                const mapping = this.mapping.get();
                const settingsChanged =
                    previous &&
                    (mapping.gapWidth !== previous.gapWidth ||
                        !shallowArrayEquals(
                            mapping.gapPositions,
                            previous.gapPositions
                        ));
                const viewportConfigured =
                    previous &&
                    !shallowArrayEquals(
                        previous.props.viewport ?? [],
                        mapping.props.viewport ?? []
                    );
                previous = mapping;
                // Domain commands belong to terminal propagation, not operation application.
                if (mapping.gapDomain && settingsChanged)
                    this.#onDomainChange(Array.from(mapping.domain));
                else {
                    if (
                        mapping.viewport !== undefined &&
                        (settingsChanged || viewportConfigured)
                    ) {
                        const interval = viewportConfigured
                            ? mapping.props.viewport
                            : mapping.viewport?.interval;
                        this.#onViewportChange(interval ? { interval } : null);
                    }
                    this.#onRangeChange();
                }
            });
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
        configureScaleProperties(working, this.#withPropertyDefaults(props));
        return applyScaleDomain(working, props);
    }

    /** @param {import("../spec/scale.js").Scale} props */
    configureProperties(props) {
        this.#domainNormalizer = undefined;
        this.#scale.props = props;
        this.#bindGenomeIfNeeded(props);
    }

    /**
     * @param {string | undefined} scaleType
     * @param {unknown} values
     * @returns {(string | number)[]}
     */
    validateRangeExpression(scaleType, values) {
        if (scaleType !== "ordinal") {
            throw new Error(
                'A scale range expression requires scale type "ordinal".'
            );
        }
        if (!Array.isArray(values) || values.length === 0) {
            throw new Error(
                "An ordinal scale range expression must return a non-empty array."
            );
        }

        const paint = isColorChannel(this.#channel);
        const kind = paint ? "CSS colors" : "strings or finite numbers";
        for (const value of values) {
            const valid = paint
                ? typeof value === "string" && color(value)
                : typeof value === "string" || Number.isFinite(value);
            if (!valid) {
                throw new Error(`Ordinal range values must be ${kind}.`);
            }
        }
        return values;
    }

    /** @param {import("../spec/scale.js").Scale} props */
    configureMapping(props) {
        const scale = this.#scale;
        const dependencies = scale.type === "null" ? [] : [this.#domainState];
        /** @param {any} value @param {string} [layoutProperty] */
        const bind = (value, layoutProperty) => {
            if (!isExprRef(value)) return () => value;
            const expression = this.#createExpression(value, layoutProperty);
            dependencies.push(...expression.dependencies);
            return expression;
        };
        const expressions = Array.isArray(props.range)
            ? props.range.map((value) => bind(value))
            : undefined;
        const readRange = isExprRef(props.range)
            ? bind(props.range)
            : undefined;
        const gaps = hasGroupingGaps(props);
        const categorical = scale.type === "band" || scale.type === "point";
        if (gaps && !["index", "locus", "band", "point"].includes(scale.type))
            throw new Error(
                "Grouping gaps require a positional index, locus, band, or point scale."
            );
        if (gaps && categorical && props.round)
            throw new Error(
                "Grouping gaps on band/point scales do not support round: true."
            );
        const positions = bind(
            gaps ? props.gapPositions : null,
            "Grouping gaps"
        );
        const width = bind(gaps ? (props.gapWidth ?? 6) : 0, "Grouping gaps");
        const paddingInputs = PADDING_KEYS.some((key) => isExprRef(props[key]))
            ? PADDING_KEYS.map((key) => bind(props[key], "Reactive padding"))
            : undefined;
        const bandKind = scale.type === "band" ? "band" : "index";
        /** @param {number} index @param {number} [fallback] */
        const readPadding = (index, fallback = 0) => {
            const key = PADDING_KEYS[index];
            const value = paddingInputs[index](null);
            const max = index === 0 ? Infinity : 1;
            if (
                isExprRef(props[key]) &&
                !(Number.isFinite(value) && value >= 0 && value <= max)
            )
                throw new Error(
                    `${key} expression must resolve to a finite number from 0 to ${max}.`
                );
            const effective = value ?? fallback;
            return key === "padding"
                ? effective
                : normalizeBandScaleProperty(bandKind, key, effective);
        };
        /** @type {import("../spec/scale.js").Scale["gapPositions"]} */
        let previousPositions;
        let gapPositions = normalizeGapPositions(null);
        // Expressions may bootstrap parameters that reference this scale. Once
        // bound, graph cycle checks guard feedback and observers can read mapping.
        this.#initializingRange = false;
        this.mapping.rebind(dependencies, () => {
            const state =
                scale.type === "null" ? null : this.#domainState.get();
            const domain = state ? state.visibleDomain : [];
            const previous = this.mapping.get();
            const rawPositions = positions(null);
            if (
                rawPositions !== previousPositions ||
                (categorical &&
                    previous?.domain !== domain &&
                    !shallowArrayEquals(previous?.domain ?? [], domain))
            ) {
                gapPositions = this.#resolveGapPositions(rawPositions, domain);
                previousPositions = rawPositions;
            }
            let range;
            if (readRange) {
                const values = this.validateRangeExpression(
                    scale.type,
                    readRange(null)
                );
                range = props.reverse
                    ? values.toReversed()
                    : Array.from(values);
            } else {
                range = expressions?.map((expression) => expression(null));
                if (props.reverse) range?.reverse();
            }
            /** @type {[number, number] | undefined} */
            let padding;
            if (paddingInputs) {
                const common = readPadding(0);
                padding = [readPadding(1, common), readPadding(2, common)];
            }
            // Interpolating schemes depend on domain cardinality.
            const prepared =
                scale.type === "null" ||
                (previous?.scale === scale &&
                    previous.props === props &&
                    previous.domain.length === domain.length)
                    ? undefined
                    : this.#prepareMapping(props);
            return {
                scale,
                props,
                padding,
                domain,
                gapDomain: state?.gapDomain,
                viewport: state?.viewport,
                gapPositions,
                gapWidth: width(null),
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
        props = this.#withPropertyDefaults(props);
        const working = this.#scale.copy();
        working.type = this.#scale.type;
        configureScaleProperties(working, props);
        configureScaleRange(working, {
            ...props,
            range: undefined,
        });
        return Object.assign(working, { props });
    }

    /** @param {import("../spec/scale.js").Scale} props */
    #withPropertyDefaults(props) {
        const next = this.#stripNonScaleProps(props);
        return {
            ...getScalePropertyDefaults(
                this.#scale.type,
                this.mapping.get()?.props,
                next
            ),
            ...next,
        };
    }

    /** @param {MappingConfiguration} configuration */
    #applyMapping({
        props,
        padding,
        range,
        prepared,
        gapPositions,
        gapWidth,
        viewport,
    }) {
        // Reset can leave a queued update behind while scale recreation fails.
        const scale = this.#scale;
        if (!scale || scale.type === "null") return;
        if (prepared) {
            configureScaleProperties(scale, prepared.props);
            // Restore the interpolator last: range() replaces color schemes.
            if (scale.range) scale.range(prepared.range());
            if ("interpolator" in prepared && "interpolator" in scale)
                scale.interpolator(prepared.interpolator());
            if ("bins" in prepared)
                /** @type {any} */ (scale).bins = prepared.bins;
            else delete (/** @type {any} */ (scale).bins);
        }
        // Static preparation can restore literal or default padding.
        if (
            padding &&
            (prepared || !equalRange(this.mapping.get()?.padding, padding))
        ) {
            const [paddingInner, paddingOuter] = padding;
            configureScaleProperties(scale, { paddingInner, paddingOuter });
        }
        if (viewport !== undefined && "viewport" in scale)
            this.#mirrorViewport(viewport);
        const nextRange =
            range ?? (props.scheme === undefined && this.#defaultRange);
        if (nextRange) scale.range(nextRange);
        if ("gapPositions" in scale) {
            if (!shallowArrayEquals(scale.gapPositions(), gapPositions))
                scale.gapPositions(gapPositions);
            if (scale.gapWidth() !== (gapWidth ?? 0)) scale.gapWidth(gapWidth);
        }
    }

    /** @param {Exclude<import("../spec/scale.js").Scale["gapPositions"], import("../spec/parameter.js").ExprRef>} value
     * @param {readonly any[]} domain
     */
    #resolveGapPositions(value, domain) {
        if (value == null) return normalizeGapPositions(null);
        if (this.#scale.type === "band" || this.#scale.type === "point") {
            if (!Array.isArray(value))
                throw new Error(
                    "Band/point gapPositions must be an array of category values or null."
                );
            if (!value.every(isScalar))
                throw new Error(
                    "Gap categories must be strings, numbers, or booleans."
                );
            const categories = new Set(value);
            return normalizeGapPositions(
                domain.flatMap((category, rank) =>
                    rank > 0 && categories.has(category) ? [rank] : []
                )
            );
        }
        if (value !== "chromosomes")
            return normalizeGapPositions(/** @type {number[]} */ (value));
        if (!isScaleLocus(this.#scale))
            throw new Error(
                'gapPositions: "chromosomes" requires a locus scale.'
            );
        return normalizeGapPositions(
            this.#scale
                .genome()
                .chromosomes.slice(1)
                .map((chrom) => chrom.continuousStart)
        );
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
     * @param {readonly number[]} [ranks]
     */
    mirrorDomain(domain, ranks) {
        this.#mirrorDomain(Array.from(domain), ranks);
    }

    /** @param {import("./scaleBand.js").CategoricalViewport | null} viewport */
    mirrorViewport(viewport) {
        this.#mirrorViewport(viewport);
    }

    /**
     * @param {import("../spec/scale.js").Scale} props
     * @returns {import("../spec/scale.js").Scale}
     */
    #stripNonScaleProps(props) {
        /** @type {import("../spec/scale.js").Scale & { domainIndexer?: ReturnType<typeof createIndexer> }} */
        const physicalProps = { ...props };
        for (const key of MANAGED_SCALE_PROPERTIES) delete physicalProps[key];
        for (const key of PADDING_KEYS) {
            if (!isExprRef(physicalProps[key])) continue;
            if (physicalProps.type !== "band" && physicalProps.type !== "index")
                throw new Error(
                    key + " expressions require a band or index scale."
                );
            delete physicalProps[key];
        }
        return physicalProps;
    }

    #wrapScaleInterceptors() {
        // Route domain and viewport writes through the domain lifecycle.
        const scale = this.#scale;
        if (scale.type === "null") return;

        /**
         * @template {(...args: any[]) => any} F
         * @param {F} read
         * @param {(value: any) => void} write
         * @returns {F}
         */
        const intercept = (read, write) =>
            /** @type {F} */ (
                function (/** @type {any} */ value) {
                    if (!arguments.length) return read();
                    write(value);
                    return scale;
                }
            );
        scale.domain = intercept(scale.domain, (values) =>
            this.#onDomainChange(Array.from(values))
        );
        if ("viewport" in scale) {
            const categorical =
                /** @type {import("./scaleBand.js").CategoricalGapScale} */ (
                    scale
                );
            categorical.viewport = intercept(
                categorical.viewport,
                this.#onViewportChange
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
            equalRange(a.padding, b.padding) &&
            (a.domain === b.domain || shallowArrayEquals(a.domain, b.domain)) &&
            shallowArrayEquals(a.gapDomain ?? [], b.gapDomain ?? []) &&
            shallowArrayEquals(a.gapPositions, b.gapPositions) &&
            a.gapWidth === b.gapWidth &&
            deepEqual(a.viewport, b.viewport) &&
            equalRange(a.range, b.range))
    );
}

const PADDING_KEYS = /** @type {const} */ ([
    "padding",
    "paddingInner",
    "paddingOuter",
]);
