import scaleLocus, { isScaleLocus } from "../genome/scaleLocus.js";
import scaleIndex from "../genome/scaleIndex.js";
import scaleNull from "../utils/scaleNull.js";

import {
    panLinear,
    zoomLinear,
    clampRange,
    span,
    panLog,
    zoomLog,
    panPow,
    zoomPow,
    isArray,
    isObject,
    isBoolean,
} from "vega-util";
import { scale as vegaScale, isDiscrete, isContinuous } from "vega-scale";

import mergeObjects from "../utils/mergeObjects.js";
import createScale, { configureScale } from "../scale/scale.js";

import {
    isColorChannel,
    isDiscreteChannel,
    isPositionalChannel,
    isPrimaryPositionalChannel,
    isSecondaryChannel,
} from "../encoder/encoder.js";
import {
    isChromosomalLocus,
    isChromosomalLocusInterval,
} from "../genome/genome.js";
import createDomain, { NominalDomain } from "../utils/domainArray.js";
import { easeCubicInOut } from "d3-ease";
import { asArray, shallowArrayEquals } from "../utils/arrayUtils.js";
import eerp from "../utils/eerp.js";
import { isExprRef } from "./paramMediator.js";

// Register scaleLocus to Vega-Scale.
// Loci are discrete but the scale's domain can be adjusted in a continuous manner.
vegaScale("index", scaleIndex, ["continuous"]);
vegaScale("locus", scaleLocus, ["continuous"]);
vegaScale("null", scaleNull, []);

export const QUANTITATIVE = "quantitative";
export const ORDINAL = "ordinal";
export const NOMINAL = "nominal";
export const LOCUS = "locus";
export const INDEX = "index";

/**
 * @template {ChannelWithScale}[T=ChannelWithScale]
 *
 * @typedef {object} ScaleResolutionMember
 * @prop {import("./unitView.js").default} view TODO: Get rid of the view reference
 * @prop {T} channel
 * @prop {import("../spec/channel.js").ChannelDefWithScale} channelDef
 * @prop {(channel: ChannelWithScale, type: import("../spec/channel.js").Type) => DomainArray} dataDomainSource
 */
/**
 * Resolution takes care of merging domains and scales from multiple views.
 * This class also provides some utility methods for zooming the scales etc..
 *
 * TODO: This has grown a bit too fat. Consider splitting.
 *
 * @implements {ScaleResolutionApi}
 */
export default class ScaleResolution {
    /**
     * @typedef {import("../types/scaleResolutionApi.js").ScaleResolutionApi} ScaleResolutionApi
     * @typedef {import("../types/scaleResolutionApi.js").ScaleResolutionEventType} ScaleResolutionEventType
     * @typedef {import("../spec/channel.js").Channel} Channel
     * @typedef {import("../spec/channel.js").ChannelWithScale} ChannelWithScale
     * @typedef {import("../spec/scale.js").NumericDomain} NumericDomain
     * @typedef {import("../spec/scale.js").ScalarDomain} ScalarDomain
     * @typedef {import("../spec/scale.js").ComplexDomain} ComplexDomain
     * @typedef {import("../spec/scale.js").ZoomParams} ZoomParams
     * @typedef {import("./unitView.js").default} UnitView
     * @typedef {import("../types/encoder.js").VegaScale} VegaScale
     * @typedef {import("../utils/domainArray.js").DomainArray} DomainArray
     * @typedef {import("../genome/genome.js").ChromosomalLocus} ChromosomalLocus
     * @typedef {import("../types/scaleResolutionApi.js").ScaleResolutionListener} ScaleResolutionListener
     *
     * @typedef {VegaScale & { props: import("../spec/scale.js").Scale }} ScaleWithProps
     */

    /** @type {number[]} */
    #zoomExtent;

    /**
     * @type {Record<ScaleResolutionEventType, Set<ScaleResolutionListener>>}
     */
    #listeners = {
        domain: new Set(),
        range: new Set(),
    };

    /** @type {ScaleWithProps} */
    #scale;

    /**
     * Keeps track of the expression references in the range. If range is modified,
     * new expressions are created and the old ones must be invalidated.
     *
     * @type {Set<import("./paramMediator.js").ExprRefFunction>}
     */
    #rangeExprRefListeners = new Set();

    /**
     * @param {Channel} channel
     */
    constructor(channel) {
        this.channel = channel;
        /** @type {ScaleResolutionMember[]} The involved views */
        this.members = [];
        /** @type {import("../spec/channel.js").Type} Data type (quantitative, nominal, etc...) */
        this.type = null;

        /** @type {string} An optional unique identifier for the scale */
        this.name = undefined;
    }

    get #firstMemberView() {
        return this.members[0].view;
    }

    get #viewContext() {
        return this.#firstMemberView.context;
    }

    /**
     * Adds a listener that is called when the scale domain is changed,
     * e.g., zoomed. The call is synchronous and happens before the views
     * are rendered.
     *
     * @param {ScaleResolutionEventType} type
     * @param {ScaleResolutionListener} listener function
     */
    addEventListener(type, listener) {
        this.#listeners[type].add(listener);
    }

    /**
     * @param {ScaleResolutionEventType} type
     * @param {ScaleResolutionListener} listener function
     */
    removeEventListener(type, listener) {
        this.#listeners[type].delete(listener);
    }

    /**
     * @param {ScaleResolutionEventType} type
     */
    #notifyListeners(type) {
        for (const listener of this.#listeners[type].values()) {
            listener({
                type,
                scaleResolution: this,
            });
        }
    }

    /**
     * Add a view to this resolution.
     * N.B. This is expected to be called in depth-first order
     *
     * @param {ScaleResolutionMember} newMember
     */
    addMember(newMember) {
        const { channel, channelDef } = newMember;
        const type = channelDef.type;
        const name = channelDef?.scale?.name;

        if (name) {
            if (this.name !== undefined && name != this.name) {
                throw new Error(
                    `Shared scales have conflicting names: "${name}" vs. "${this.name}"!`
                );
            }
            this.name = name;
        }

        if (!this.type) {
            this.type = type;
        } else if (type !== this.type && !isSecondaryChannel(channel)) {
            // TODO: Include a reference to the layer
            throw new Error(
                `Can not use shared scale for different data types: ${this.type} vs. ${type}. Use "resolve: independent" for channel ${this.channel}`
            );
            // Actually, point scale could be changed into band scale
            // TODO: Use the same merging logic as in: https://github.com/vega/vega-lite/blob/master/src/scale.ts
        }

        this.members.push(newMember);
    }

    /**
     * Returns true if the domain has been defined explicitly, i.e. not extracted from the data.
     */
    #isExplicitDomain() {
        return !!this.#getConfiguredDomain();
    }

    #isDomainInitialized() {
        const s = this.#scale;
        if (!s) {
            return false;
        }

        const domain = s.domain();

        // We could alternatively have a flag that is set when the domain is initialized.
        if (isContinuous(s.type)) {
            return (
                domain.length > 2 ||
                (domain.length == 2 && (domain[0] !== 0 || domain[1] !== 0))
            );
        } else {
            return domain.length > 0;
        }
    }

    /**
     * Collects and merges scale properties from the participating views.
     * Does not include inferred default values such as schemes etc.
     *
     * @returns {import("../spec/scale.js").Scale}
     */
    #getMergedScaleProps() {
        const propArray = this.members
            .map((member) => member.channelDef.scale)
            .filter((props) => props !== undefined);

        // TODO: Disabled scale: https://vega.github.io/vega-lite/docs/scale.html#disable
        return mergeObjects(propArray, "scale", ["domain"]);
    }

    /**
     * Returns the merged scale properties supplemented with inferred properties
     * and domain.
     *
     * @param {boolean} [extractDataDomain]
     * @returns {import("../spec/scale.js").Scale}
     */
    #getScaleProps(extractDataDomain = false) {
        const mergedProps = this.#getMergedScaleProps();
        if (mergedProps === null || mergedProps.type == "null") {
            // No scale (pass-thru)
            // TODO: Check that the channel is compatible
            return { type: "null" };
        }

        const props = {
            ...this.#getDefaultScaleProperties(this.type),
            ...mergedProps,
        };

        if (!props.type) {
            props.type = getDefaultScaleType(this.channel, this.type);
        }

        const domain = this.#getInitialDomain(extractDataDomain);

        if (domain && domain.length > 0) {
            props.domain = domain;
        } else if (isDiscrete(props.type)) {
            props.domain = new NominalDomain();
        }

        if (!props.domain && props.domainMid !== undefined) {
            // Initialize with a bogus domain so that scale.js can inject the domainMid.
            // The number of domain elements must be know before the glsl scale is generated.
            props.domain = [props.domainMin ?? 0, props.domainMax ?? 1];
        }

        // Reverse discrete y axis
        if (
            this.channel == "y" &&
            isDiscrete(props.type) &&
            props.reverse == undefined
        ) {
            props.reverse = true;
        }

        if (props.range && props.scheme) {
            delete props.scheme;
            // TODO: Props should be set more intelligently
            /*
                throw new Error(
                    `Scale has both "range" and "scheme" defined! Views: ${this._getViewPaths()}`
                );
                */
        }

        // By default, index and locus scales are zoomable, others are not
        if (!("zoom" in props) && ["index", "locus"].includes(props.type)) {
            props.zoom = true;
        }

        applyLockedProperties(props, this.channel);

        return props;
    }

    /**
     * Configures range. If range is an array of expressions, they are evaluated
     * and the scale is updated when the expressions change.
     */
    #configureRange() {
        const props = this.#scale.props;
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
                this.#scale.range(
                    flip(
                        expressions.map((expr) => expr()),
                        props.reverse
                    )
                );
            };

            expressions = range.map((elem) => {
                if (isExprRef(elem)) {
                    const fn =
                        this.#firstMemberView.paramMediator.createExpression(
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
            this.#scale.range(flip(range, props.reverse));
        }
    }

    /**
     *
     * @param {boolean} extractDataDomain
     */
    #getInitialDomain(extractDataDomain = false) {
        // TODO: intersect the domain with zoom extent (if it's defined)
        return (
            this.#getConfiguredDomain() ??
            (this.type == LOCUS
                ? this.getGenome().getExtent()
                : extractDataDomain
                ? this.getDataDomain()
                : [])
        );
    }

    /**
     * Unions the configured domains of all participating views.
     *
     * @return { DomainArray }
     */
    #getConfiguredDomain() {
        const domains = this.members
            .map((member) => member.channelDef)
            .filter((channelDef) => channelDef.scale?.domain)
            .map((channelDef) =>
                // TODO: Handle ExprRefs and Param in domain
                createDomain(
                    channelDef.type,
                    // Chrom/pos must be linearized first
                    this.fromComplexInterval(channelDef.scale.domain)
                )
            );

        if (domains.length > 0) {
            return domains.reduce((acc, curr) => acc.extendAll(curr));
        }
    }

    /**
     * Extracts and unions the data domains of all participating views.
     *
     * @return { DomainArray }
     */
    getDataDomain() {
        return this.members
            .map((member) =>
                member.dataDomainSource?.(member.channel, this.type)
            )
            .filter((domain) => !!domain)
            .reduce((acc, curr) => acc.extendAll(curr));
    }

    /**
     * Reconfigures the scale: updates domain and other settings
     */
    reconfigure() {
        const scale = this.#scale;

        if (!scale || scale.type == "null") {
            return;
        }

        const domainWasInitialized = this.#isDomainInitialized();
        const previousDomain = scale.domain();

        const props = this.#getScaleProps(true);
        configureScale({ ...props, range: undefined }, scale);

        // Annotate the scale with the new props
        scale.props = props;
        this.#configureRange();

        if (isContinuous(scale.type)) {
            this.#zoomExtent = this.#getZoomExtent();
        }

        if (!domainWasInitialized) {
            this.#notifyListeners("domain");
            return;
        }

        const newDomain = scale.domain();
        if (!shallowArrayEquals(newDomain, previousDomain)) {
            if (this.isZoomable()) {
                // Don't mess with zoomed views, restore the previous domain
                scale.domain(previousDomain);
            } else if (this.#isZoomingSupported()) {
                // It can be zoomed, so lets make a smooth transition.
                // Restore the previous domain and zoom smoothly to the new domain.
                scale.domain(previousDomain);
                this.zoomTo(newDomain, 500); // TODO: Configurable duration
            } else {
                // Update immediately if the previous domain was the initial domain [0, 0]
                this.#notifyListeners("domain");
            }
        }
    }

    /**
     * @returns {ScaleWithProps}
     */
    get scale() {
        if (this.#scale) {
            return this.#scale;
        }

        const props = this.#getScaleProps();

        const scale = createScale({ ...props, range: undefined });
        // Annotate the scale with props
        scale.props = props;

        if ("unknown" in scale) {
            // Never allow implicit domain construction
            scale.unknown(null);
        }

        this.#scale = scale;
        this.#configureRange();

        if (isScaleLocus(scale)) {
            scale.genome(this.getGenome());
        }

        if (isContinuous(scale.type)) {
            this.#zoomExtent = this.#getZoomExtent();
        }

        // Hijack the range method
        const range = scale.range;
        if (range) {
            const notify = () => this.#notifyListeners("range");
            scale.range = function (/** @type {any} */ _) {
                if (arguments.length) {
                    range(_);
                    notify();
                } else {
                    return range();
                }
            };
            // The initial setting
            notify();
        }

        return scale;
    }

    getDomain() {
        return this.scale.domain();
    }

    /**
     * @returns {NumericDomain | ComplexDomain}
     */
    getComplexDomain() {
        return (
            this.getGenome()?.toChromosomalInterval(this.getDomain()) ??
            this.getDomain()
        );
    }

    /**
     * Return true if the scale is zoomable and the current domain differs from the initial domain.
     *
     * @returns true if zoomed
     */
    isZoomed() {
        return (
            this.#isZoomingSupported() &&
            shallowArrayEquals(this.#getInitialDomain(), this.getDomain())
        );
    }

    /**
     * Returns true if zooming is supported and allowed in view spec.
     */
    isZoomable() {
        // Check explicit configuration
        return this.#isZoomingSupported() && !!this.scale.props.zoom;
    }

    /**
     * Returns true if zooming is supported but not necessarily allowed in view spec.
     */
    #isZoomingSupported() {
        const type = this.scale.type;
        return isContinuous(type);
    }

    /**
     * Pans (translates) and zooms using a specified scale factor.
     *
     * @param {number} scaleFactor
     * @param {number} scaleAnchor
     * @param {number} pan
     * @returns {boolean} true if the scale was zoomed
     */
    zoom(scaleFactor, scaleAnchor, pan) {
        if (!this.#isZoomingSupported()) {
            return false;
        }

        const scale = this.scale;
        const oldDomain = scale.domain();
        let newDomain = [...oldDomain];

        /** @type {number} */
        // @ts-ignore
        let anchor = scale.invert(scaleAnchor);

        if (scale.props.reverse) {
            pan = -pan;
        }

        if ("align" in scale) {
            anchor += scale.align();
        }

        // TODO: symlog
        switch (scale.type) {
            case "linear":
            case "index":
            case "locus":
                newDomain = panLinear(newDomain, pan || 0);
                newDomain = zoomLinear(newDomain, anchor, scaleFactor);
                break;
            case "log":
                newDomain = panLog(newDomain, pan || 0);
                newDomain = zoomLog(newDomain, anchor, scaleFactor);
                break;
            case "pow":
            case "sqrt": {
                const powScale =
                    /** @type {import("d3-scale").ScalePower<number, number>} */ (
                        scale
                    );
                newDomain = panPow(newDomain, pan || 0, powScale.exponent());
                newDomain = zoomPow(
                    newDomain,
                    anchor,
                    scaleFactor,
                    powScale.exponent()
                );
                break;
            }
            default:
                throw new Error(
                    "Zooming is not implemented for: " + scale.type
                );
        }

        // TODO: Use the zoomTo method. Move clamping etc there.
        if (this.#zoomExtent) {
            newDomain = clampRange(
                newDomain,
                this.#zoomExtent[0],
                this.#zoomExtent[1]
            );
        }

        if ([0, 1].some((i) => newDomain[i] != oldDomain[i])) {
            scale.domain(newDomain);
            this.#notifyListeners("domain");
            return true;
        }

        return false;
    }

    /**
     * Immediately zooms to the given interval.
     *
     * @param {NumericDomain | ComplexDomain} domain
     * @param {boolean | number} [duration] an approximate duration for transition.
     *      Zero duration zooms immediately. Boolean `true` indicates a default duration.
     */
    async zoomTo(domain, duration = false) {
        if (isBoolean(duration)) {
            duration = duration ? 700 : 0;
        }

        if (!this.#isZoomingSupported()) {
            throw new Error("Not a zoomable scale!");
        }

        const to = this.fromComplexInterval(domain);

        // TODO: Intersect the domain with zoom extent

        const animator = this.#viewContext.animator;

        const scale = this.scale;
        const from = /** @type {number[]} */ (scale.domain());

        if (duration > 0 && from.length == 2) {
            // Spans
            const fw = from[1] - from[0];
            const tw = to[1] - to[0];

            // Centers
            const fc = from[0] + fw / 2;
            const tc = to[0] + tw / 2;

            // Constant endpoints. Skip calculation to maintain precision.
            const ac = from[0] == to[0];
            const bc = from[1] == to[1];

            // TODO: Abort possible previous transition
            await animator.transition({
                duration,
                easingFunction: easeCubicInOut,
                onUpdate: (t) => {
                    const w = eerp(fw, tw, t);
                    const wt = fw == tw ? t : (fw - w) / (fw - tw);
                    const c = wt * tc + (1 - wt) * fc;
                    const domain = [
                        ac ? from[0] : c - w / 2,
                        bc ? from[1] : c + w / 2,
                    ];
                    scale.domain(domain);
                    this.#notifyListeners("domain");
                },
            });

            scale.domain(to);
            this.#notifyListeners("domain");
        } else {
            scale.domain(to);
            animator?.requestRender();
            this.#notifyListeners("domain");
        }
    }

    /**
     * Resets the current domain to the initial one
     *
     * @returns true if the domain was changed
     */
    resetZoom() {
        if (!this.#isZoomingSupported()) {
            throw new Error("Not a zoomable scale!");
        }

        const oldDomain = this.getDomain();
        const newDomain = this.#getInitialDomain();

        if ([0, 1].some((i) => newDomain[i] != oldDomain[i])) {
            this.#scale.domain(newDomain);
            this.#notifyListeners("domain");
            return true;
        }
        return false;
    }

    /**
     * Returns the zoom level with respect to the reference domain span (the original domain).
     *
     * In principle, this is highly specific to positional channels. However, zooming can
     * be generalized to other quantitative channels such as color, opacity, size, etc.
     */
    getZoomLevel() {
        // Zoom level makes sense only for user-zoomable scales where zoom extent is defined
        if (this.isZoomable()) {
            return span(this.#zoomExtent) / span(this.scale.domain());
        }

        return 1.0;
    }

    #getZoomExtent() {
        const props = this.scale.props;
        const zoom = props.zoom;

        if (isZoomParams(zoom)) {
            if (isArray(zoom.extent)) {
                return this.fromComplexInterval(zoom.extent);
            }
        }

        if (zoom) {
            if (props.type == "locus") {
                return this.getGenome().getExtent();
            }

            // TODO: Perhaps this should be "domain" for index scale and nothing for quantitative.
            // Would behave similarly to Vega-Lite, which doesn't have constraints.
            return this.#scale.domain();
        }
    }

    /**
     * TODO: These actually depend on the mark, so this is clearly a wrong place.
     * And besides, these should be configurable (themeable)
     *
     * @param {string} dataType
     */
    #getDefaultScaleProperties(dataType) {
        const channel = this.channel;
        const props = {};

        if (this.#isExplicitDomain()) {
            props.zero = false;
        }

        if (isPositionalChannel(channel)) {
            props.nice = !this.#isExplicitDomain();
        } else if (isColorChannel(channel)) {
            // TODO: Named ranges
            props.scheme =
                dataType == NOMINAL
                    ? "tableau10"
                    : dataType == ORDINAL
                    ? "blues"
                    : "viridis";
        } else if (isDiscreteChannel(channel)) {
            // Shapes of point mark, for example
            props.range =
                channel == "shape"
                    ? ["circle", "square", "triangle-up", "cross", "diamond"]
                    : [];
        } else if (channel == "size") {
            props.range = [0, 400]; // TODO: Configurable default. This is currently optimized for points.
        } else if (channel == "angle") {
            props.range = [0, 360];
        }

        return props;
    }

    /**
     *
     * @returns {import("../genome/genome.js").default}
     */
    getGenome() {
        if (this.type !== "locus") {
            return undefined;
        }

        // TODO: Support multiple assemblies
        const genome = this.#viewContext.genomeStore?.getGenome();
        if (!genome) {
            throw new Error("No genome has been defined!");
        }
        return genome;
    }

    // TODO: Move the "complex" stuff into scaleLocus.

    /**
     * Inverts a value in range to a value on domain. Returns an object in
     * case of locus scale.
     *
     * @param {number} value
     */
    invertToComplex(value) {
        const scale = this.scale;
        if ("invert" in scale) {
            const inverted = /** @type {number} */ (scale.invert(value));
            return this.toComplex(inverted);
        } else {
            throw new Error("The scale does not support inverting!");
        }
    }

    /**
     * @param {number} value
     */
    toComplex(value) {
        const genome = this.getGenome();
        return genome ? genome.toChromosomal(value) : value;
    }

    /**
     * @param {number | ChromosomalLocus} complex
     * @returns {number}
     */
    fromComplex(complex) {
        if (isChromosomalLocus(complex)) {
            const genome = this.getGenome();
            return genome.toContinuous(complex.chrom, complex.pos);
        }
        return complex;
    }

    /**
     * @param {ScalarDomain | ComplexDomain} interval
     * @returns {number[]}
     */
    fromComplexInterval(interval) {
        if (this.type === "locus" && isChromosomalLocusInterval(interval)) {
            return this.getGenome().toContinuousInterval(interval);
        }
        return /** @type {number[]} */ (interval);
    }
}

/**
 *
 * @param {Channel} channel
 * @param {string} dataType
 * @returns {import("../spec/scale.js").ScaleType}
 */
function getDefaultScaleType(channel, dataType) {
    // TODO: Band scale, Bin-Quantitative

    if (dataType == INDEX || dataType == LOCUS) {
        if (isPrimaryPositionalChannel(channel)) {
            return dataType;
        } else {
            // TODO: Also explicitly set scales should be validated
            throw new Error(
                `${channel} does not support ${dataType} data type. Only positional channels do.`
            );
        }
    }

    /**
     * @type {Partial<Record<Channel, (import("../spec/scale.js").ScaleType | undefined)[]>>}
     * Default types: nominal, ordinal, quantitative.
     * undefined = incompatible, "null" = disabled (pass-thru)
     */
    const defaults = {
        x: ["band", "band", "linear"],
        y: ["band", "band", "linear"],
        size: [undefined, "point", "linear"],
        opacity: [undefined, "point", "linear"],
        fillOpacity: [undefined, "point", "linear"],
        strokeOpacity: [undefined, "point", "linear"],
        color: ["ordinal", "ordinal", "linear"],
        fill: ["ordinal", "ordinal", "linear"],
        stroke: ["ordinal", "ordinal", "linear"],
        strokeWidth: [undefined, undefined, "linear"],
        shape: ["ordinal", "ordinal", undefined],
        dx: [undefined, undefined, "null"],
        dy: [undefined, undefined, "null"],
        angle: [undefined, undefined, "linear"],
    };

    /** @type {Channel[]} */
    const typelessChannels = ["sample"];

    const type = typelessChannels.includes(channel)
        ? "null"
        : defaults[channel]
        ? defaults[channel][[NOMINAL, ORDINAL, QUANTITATIVE].indexOf(dataType)]
        : dataType == QUANTITATIVE
        ? "linear"
        : "ordinal";

    if (type === undefined) {
        throw new Error(
            `Channel "${channel}" is not compatible with "${dataType}" data type. Use of a proper scale may be needed.`
        );
    }

    return type;
}

/**
 * @param {import("../spec/scale.js").Scale} props
 * @param {import("../spec/channel.js").Channel} channel
 */
function applyLockedProperties(props, channel) {
    if (isPositionalChannel(channel) && props.type !== "ordinal") {
        props.range = [0, 1];
    }

    if (channel == "opacity" && isContinuous(props.type)) {
        props.clamp = true;
    }
}

/**
 *
 * @param {boolean | ZoomParams} zoom
 * @returns {zoom is ZoomParams}
 */
function isZoomParams(zoom) {
    return isObject(zoom);
}

/**
 * Reconfigures scales, starting from the given view.
 *
 * TODO: This should be made unnecessary. Collectors should trigger the reconfiguration
 * for those views that get their data from the collector.
 *
 * TODO: This may reconfigure channels that are not affected by the change.
 * Causes performance issues with domains that are extracted from data.
 *
 * @param {import("./view.js").default | import("./view.js").default[]} fromViews
 */
export function reconfigureScales(fromViews) {
    /** @type {Set<ScaleResolution>} */
    const uniqueResolutions = new Set();

    /** @param {import("./view.js").default} view */
    function collectResolutions(view) {
        for (const resolution of Object.values(view.resolutions.scale)) {
            uniqueResolutions.add(resolution);
        }
    }

    for (const fromView of asArray(fromViews)) {
        // Descendants
        fromView.visit(collectResolutions);

        // Ancestors
        for (const view of fromView.getDataAncestors()) {
            // Skip axis views etc. They should not mess with the domains.
            if (!view.options.contributesToScaleDomain) {
                break;
            }
            collectResolutions(view);
        }
    }

    uniqueResolutions.forEach((resolution) => resolution.reconfigure());
}
