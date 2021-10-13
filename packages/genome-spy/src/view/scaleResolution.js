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
import { isDiscrete, isContinuous } from "vega-scale";

import mergeObjects from "../utils/mergeObjects";
import createScale, { configureScale } from "../scale/scale";

import { invalidate, getCachedOrCall } from "../utils/propertyCacher";
import {
    getChannelDefWithScale,
    getDiscreteRange,
    isColorChannel,
    isDiscreteChannel,
    isPositionalChannel,
    isSecondaryChannel,
    primaryPositionalChannels,
} from "../encoder/encoder";
import {
    isChromosomalLocus,
    isChromosomalLocusInterval,
} from "../genome/genome";
import { NominalDomain } from "../utils/domainArray";
import { easeQuadInOut } from "d3-ease";
import { interpolateZoom } from "d3-interpolate";

export const QUANTITATIVE = "quantitative";
export const ORDINAL = "ordinal";
export const NOMINAL = "nominal";
export const LOCUS = "locus"; // Humdum, should this be "genomic"?
export const INDEX = "index";

/**
 * Resolution takes care of merging domains and scales from multiple views.
 * This class also provides some utility methods for zooming the scales etc..
 *
 * TODO: This has grown a bit too fat. Consider splitting.
 *
 * @typedef {import("./scaleResolutionApi").ScaleResolutionApi} ScaleResolutionApi
 * @implements {ScaleResolutionApi}
 *
 * @typedef {{view: import("./unitView").default, channel: Channel}} ResolutionMember
 * @typedef {import("./unitView").default} UnitView
 * @typedef {import("../encoder/encoder").VegaScale} VegaScale
 * @typedef {import("../utils/domainArray").DomainArray} DomainArray
 * @typedef {import("../genome/genome").ChromosomalLocus} ChromosomalLocus
 *
 * @typedef {import("../spec/channel").Channel} Channel
 * @typedef {import("../spec/scale").Scale} Scale
 * @typedef {import("../spec/scale").NumericDomain} NumericDomain
 * @typedef {import("../spec/scale").ScalarDomain} ScalarDomain
 * @typedef {import("../spec/scale").ComplexDomain} ComplexDomain
 * @typedef {import("../spec/scale").ZoomParams} ZoomParams
 */
export default class ScaleResolution {
    /**
     * @param {Channel} channel
     */
    constructor(channel) {
        this.channel = channel;
        /** @type {ResolutionMember[]} The involved views */
        this.members = [];
        /** @type {string} Data type (quantitative, nominal, etc...) */
        this.type = null;

        /** @type {number[]} */
        this._zoomExtent = undefined;

        /** @type {Set<import("./scaleResolutionApi").ScaleResolutionListener>} Observers that are called when the scale domain is changed */
        this._domainListeners = new Set();

        /** @type {string} An optional unique identifier for the scale */
        this.name = undefined;

        /** @type {VegaScale} */
        this._scale = undefined;
    }

    /**
     * Adds a listener that is called when the scale domain is changed,
     * e.g., zoomed. The call is synchronous and happens before the views
     * are rendered.
     *
     * @param {"domain"} type
     * @param {import("./scaleResolutionApi").ScaleResolutionListener} listener function
     */
    addEventListener(type, listener) {
        if (type != "domain") {
            throw new Error("Unsupported event type: " + type);
        }
        this._domainListeners.add(listener);
    }

    /**
     * @param {"domain"} type
     * @param {import("./scaleResolutionApi").ScaleResolutionListener} listener function
     */
    removeEventListener(type, listener) {
        if (type != "domain") {
            throw new Error("Unsupported event type: " + type);
        }
        this._domainListeners.delete(listener);
    }

    _notifyDomainListeners() {
        for (const listener of this._domainListeners.values()) {
            listener({
                type: "domain",
                scaleResolution: this,
            });
        }
    }

    /**
     * Add a view to this resolution.
     * N.B. This is expected to be called in depth-first order
     *
     * @param {UnitView} view
     * @param {import("./view").Channel} channel
     */
    pushUnitView(view, channel) {
        const channelDef = getChannelDefWithScale(view, channel);
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

        this.members.push({ view, channel });
    }

    /**
     * Returns true if the domain has been defined explicitly, i.e. not extracted from the data.
     */
    isExplicitDomain() {
        return !!this.getConfiguredDomain();
    }

    /**
     * Collects and merges scale properties from the participating views.
     * Does not include inferred default values such as schemes etc.
     *
     * @returns {import("../spec/scale").Scale}
     */
    _getMergedScaleProps() {
        return getCachedOrCall(this, "mergedScaleProps", () => {
            const propArray = this.members
                .map(
                    (member) =>
                        getChannelDefWithScale(member.view, member.channel)
                            .scale
                )
                .filter((props) => props !== undefined);

            // TODO: Disabled scale: https://vega.github.io/vega-lite/docs/scale.html#disable
            return mergeObjects(propArray, "scale", ["domain"]);
        });
    }

    /**
     * Returns the merged scale properties supplemented with inferred properties
     * and domain.
     *
     * @returns {import("../spec/scale").Scale}
     */
    getScaleProps() {
        // eslint-disable-next-line complexity
        return getCachedOrCall(this, "scaleProps", () => {
            const mergedProps = this._getMergedScaleProps();
            if (mergedProps === null || mergedProps.type == "null") {
                // No scale (pass-thru)
                // TODO: Check that the channel is compatible
                return { type: "null" };
            }

            const props = {
                ...this._getDefaultScaleProperties(this.type),
                ...mergedProps,
            };

            if (!props.type) {
                props.type = getDefaultScaleType(this.channel, this.type);
            }

            const domain =
                this.getConfiguredDomain() ??
                (this.type == LOCUS
                    ? this.getGenome().getExtent()
                    : this.getDataDomain());

            // TODO: intersect the domain with zoom extent (if it's defined)

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

            // Genomic coordinates need higher precision
            if (props.type == LOCUS && !("fp64" in props)) {
                props.fp64 = true;
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
        });
    }

    /**
     * Unions the configured domains of all participating views.
     *
     * @return { DomainArray }
     */
    getConfiguredDomain() {
        return this._reduceDomains((member) =>
            isSecondaryChannel(member.channel)
                ? undefined
                : member.view.getConfiguredDomain(member.channel)
        );
    }

    /**
     * Extracts and unions the data domains of all participating views.
     *
     * @return { DomainArray }
     */
    getDataDomain() {
        // TODO: Optimize: extract domain only once if the views share the data
        return this._reduceDomains((member) =>
            isSecondaryChannel(member.channel)
                ? undefined
                : member.view.extractDataDomain(member.channel)
        );
    }

    /**
     * Reconfigures the scale: updates domain and other settings
     */
    reconfigure() {
        if (this._scale && this._scale.type != "null") {
            invalidate(this, "scaleProps");
            const props = this.getScaleProps();
            configureScale(props, this._scale);
            if (isContinuous(this._scale.type)) {
                this._zoomExtent = this._getZoomExtent();
            }
        }
    }

    /**
     * @returns {import("../encoder/encoder").VegaScale}
     */
    getScale() {
        if (this._scale) {
            return this._scale;
        }

        const props = this.getScaleProps();

        const scale = createScale(props);
        this._scale = scale;

        if (scale.type == "locus") {
            scale.genome(this.getGenome());
        }

        // Tag the scale and inform encoders and shaders that emulated
        // 64bit floats should be used.
        // N.B. the tag is lost upon scale.clone().
        scale.fp64 = !!props.fp64;

        if (isContinuous(scale.type)) {
            this._zoomExtent = this._getZoomExtent();
        }

        return scale;
    }

    getDomain() {
        return this.getScale().domain();
    }

    /**
     * @returns {NumericDomain | ComplexDomain}
     */
    getComplexDomain() {
        // @ts-ignore
        return this.getDomain().map((x) => this.toComplex(x));
    }

    isZoomable() {
        if (!primaryPositionalChannels.includes(this.channel)) {
            return false;
        }

        const scaleType = this.getScale().type;
        if (
            !["linear", "locus", "index", "log", "pow", "sqrt"].includes(
                scaleType
            )
        ) {
            return false;
        }

        // Check explicit configuration
        return !!this.getScaleProps().zoom;
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
        if (!this.isZoomable()) {
            return false;
        }

        const scale = this.getScale();
        const oldDomain = scale.domain();
        let newDomain = [...oldDomain];

        const anchor = scale.invert(scaleAnchor);

        if (this.getScaleProps().reverse) {
            pan = -pan;
        }

        // TODO: log, pow, symlog, ...
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
            case "sqrt":
                newDomain = panPow(newDomain, pan || 0, scale.exponent());
                newDomain = zoomPow(
                    newDomain,
                    anchor,
                    scaleFactor,
                    scale.exponent()
                );
                break;
            default:
                throw new Error("Unsupported scale type: " + scale.type);
        }

        // TODO: Use the zoomTo method. Move clamping etc there.
        if (this._zoomExtent) {
            newDomain = clampRange(newDomain, ...this._zoomExtent);
        }

        if ([0, 1].some((i) => newDomain[i] != oldDomain[i])) {
            scale.domain(newDomain);
            this._notifyDomainListeners();
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

        if (!this.isZoomable()) {
            throw new Error("Not a zoomable scale!");
        }

        const to = this.fromComplexInterval(domain);

        // TODO: Intersect the domain with zoom extent

        const animator = this.members[0]?.view.context.animator;

        const scale = this.getScale();
        const from = /** @type {number[]} */ (scale.domain());

        if (duration > 0 && from.length == 2) {
            const fw = from[1] - from[0];
            const fc = from[0] + fw / 2;

            const tw = to[1] - to[0];
            const tc = to[0] + tw / 2;

            /*
            await animator.transition({
                duration,
                easingFunction: easeExpInOut,
                onUpdate: (t) => {
                    const w = eerp(fw, tw, t);
                    const wt = (fw - w) / (fw - tw);
                    const c = wt * tc + (1 - wt) * fc;
                    scale.domain([c - w / 2, c + w / 2]);
                    this._notifyDomainListeners();
                },
            });
            */
            const interpolator = interpolateZoom.rho(0.7)(
                [fc, 0, fw],
                [tc, 0, tw]
            );
            await animator.transition({
                duration: (duration * interpolator.duration) / 10000,
                easingFunction: easeQuadInOut,
                onUpdate: (t) => {
                    const [c, , w] = interpolator(t);
                    scale.domain([c - w / 2, c + w / 2]);
                    this._notifyDomainListeners();
                },
            });
        } else {
            scale.domain(to);
            animator?.requestRender();
            this._notifyDomainListeners();
        }
    }

    /**
     * Returns the zoom level with respect to the reference domain span (the original domain).
     *
     * In principle, this is highly specific to positional channels. However, zooming can
     * be generalized to other quantitative channels such as color, opacity, size, etc.
     */
    getZoomLevel() {
        if (this.isZoomable()) {
            return span(this._zoomExtent) / span(this.getScale().domain());
        }

        return 1.0;
    }

    _getZoomExtent() {
        const props = this.getScaleProps();
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
            return this._scale.domain();
        }
    }

    /**
     * TODO: These actually depend on the mark, so this is clearly a wrong place.
     * And besides, these should be configurable (themeable)
     *
     * @param {string} dataType
     */
    _getDefaultScaleProperties(dataType) {
        const channel = this.channel;
        const props = {};

        if (this.isExplicitDomain()) {
            props.zero = false;
        }

        if (isPositionalChannel(channel)) {
            props.nice = !this.isExplicitDomain();
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
            props.range = getDiscreteRange(channel);
        } else if (channel == "size") {
            props.range = [0, 400]; // TODO: Configurable default. This is currently optimized for points.
        } else if (channel == "angle") {
            props.range = [0, 360];
        }

        return props;
    }

    getGenome() {
        if (this.type !== "locus") {
            return undefined;
        }

        // TODO: Support multiple assemblies
        const genome = this.members[0].view.context.genomeStore?.getGenome();
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
        const scale = this.getScale();
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

    _getViewPaths() {
        return this.members.map((v) => v.view.getPathString()).join(", ");
    }

    /**
     * Iterate all participanting views and reduce (union) their domains using an accessor.
     * Accessor may return the an explicitly configured domain or a domain extracted from the data.
     *
     * @param {function(ResolutionMember):DomainArray} domainAccessor
     * @returns {DomainArray}
     */
    _reduceDomains(domainAccessor) {
        const domains = this.members
            .map(domainAccessor)
            .filter((domain) => !!domain);

        if (domains.length) {
            return domains.reduce((acc, curr) => acc.extendAll(curr));
        }
    }
}

/**
 *
 * @param {Channel} channel
 * @param {string} dataType
 */
function getDefaultScaleType(channel, dataType) {
    // TODO: Band scale, Bin-Quantitative

    if ([INDEX, LOCUS].includes(dataType)) {
        if (primaryPositionalChannels.includes(channel)) {
            return dataType;
        } else {
            // TODO: Also explicitly set scales should be validated
            throw new Error(
                `${channel} does not support ${dataType} data type. Only positional channels do.`
            );
        }
    }

    /**
     * @type {Partial<Record<Channel, string[]>>}
     * Default types: nominal, ordinal, quantitative.
     * undefined = incompatible, "null" = disabled (pass-thru)
     */
    const defaults = {
        uniqueId: ["null", undefined, undefined],
        facetIndex: ["null", undefined, undefined],
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
        sample: ["null", "null", undefined],
        semanticScore: [undefined, undefined, "null"],
        search: ["null", undefined, undefined],
        text: ["null", "null", "null"],
        dx: [undefined, undefined, "null"],
        dy: [undefined, undefined, "null"],
        angle: [undefined, undefined, "linear"],
    };

    const type = defaults[channel]
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
 * @param {import("../spec/scale").Scale} props
 * @param {import("../spec/channel").Channel} channel
 */
function applyLockedProperties(props, channel) {
    if (isPositionalChannel(channel) && props.type !== "ordinal") {
        props.range = [0, 1];
    }

    if (channel == "opacity") {
        if (isContinuous(props.type)) {
            props.clamp = true;
        }
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
