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

import ScaleInstanceManager from "./scaleInstanceManager.js";
import { resolveScalePropsBase } from "./scalePropsResolver.js";
import ScaleDomainAggregator from "./scaleDomainAggregator.js";
import {
    INDEX,
    LOCUS,
    NOMINAL,
    ORDINAL,
    QUANTITATIVE,
} from "./scaleResolutionConstants.js";

import { isSecondaryChannel } from "../encoder/encoder.js";
import {
    isChromosomalLocus,
    isChromosomalLocusInterval,
} from "../genome/genome.js";
import { NominalDomain } from "../utils/domainArray.js";
import { easeCubicInOut } from "d3-ease";
import { asArray, shallowArrayEquals } from "../utils/arrayUtils.js";
import eerp from "../utils/eerp.js";

// Register scaleLocus to Vega-Scale.
// Loci are discrete but the scale's domain can be adjusted in a continuous manner.
vegaScale("index", scaleIndex, ["continuous"]);
vegaScale("locus", scaleLocus, ["continuous"]);
vegaScale("null", scaleNull, []);

export { INDEX, LOCUS, NOMINAL, ORDINAL, QUANTITATIVE };

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

    /** @type {Set<ScaleResolutionMember>} The involved views */
    #members = new Set();

    /**
     * @type {Record<ScaleResolutionEventType, Set<ScaleResolutionListener>>}
     */
    #listeners = {
        domain: new Set(),
        range: new Set(),
    };

    /** @type {ScaleInstanceManager} */
    #scaleManager;

    /** @type {ScaleDomainAggregator} */
    #domainAggregator;

    /**
     * @param {Channel} channel
     */
    constructor(channel) {
        this.channel = channel;
        /** @type {import("../spec/channel.js").Type} Data type (quantitative, nominal, etc...) */
        this.type = null;

        /** @type {string} An optional unique identifier for the scale */
        this.name = undefined;

        this.#domainAggregator = new ScaleDomainAggregator({
            getMembers: () => this.#members,
            getType: () => this.type,
            getGenome: () => this.getGenome(),
            fromComplexInterval: this.fromComplexInterval.bind(this),
        });

        this.#scaleManager = new ScaleInstanceManager({
            getParamMediator: () => this.#firstMemberView.paramMediator,
            onRangeChange: () => this.#notifyListeners("range"),
        });
    }

    /**
     * @returns {import("./view.js").default}
     */
    get #firstMemberView() {
        const first = this.#members.values().next().value;
        if (!first) {
            throw new Error("ScaleResolution has no members!");
        }
        return first.view;
    }

    get #viewContext() {
        return this.#firstMemberView.context;
    }

    get zoomExtent() {
        return (
            (this.#scaleManager.scale &&
                isContinuous(this.#scaleManager.scale.type) &&
                this.#getZoomExtent()) ?? [-Infinity, Infinity]
        );
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
    #addMember(newMember) {
        const { channel, channelDef } = newMember;

        // A convenience hack for cases where the new member should adapt
        // the scale type to the existing one. For example: SelectionRect
        // TODO: Add test
        const adapt = channelDef.type == null && this.type;

        if (
            // @ts-expect-error "sample" is not really a channel with scale
            channel != "sample" &&
            !channelDef.type &&
            !isSecondaryChannel(channel) &&
            !adapt
        ) {
            throw new Error(
                `The "type" property must be defined in channel definition: "${channel}": ${JSON.stringify(
                    channelDef
                )}. Must be one of: "quantitative", "ordinal", "nominal", "locus", "index"`
            );
        }

        // A hack for sample channel, which really doesn't have a scale but the
        // domain is needed when samples are not specified explicitly.
        // @ts-expect-error "sample" is not really a channel with scale
        const type = channel == "sample" ? "nominal" : channelDef.type;
        const name = channelDef?.scale?.name;

        if (name) {
            if (this.name !== undefined && name != this.name) {
                throw new Error(
                    `Shared scales have conflicting names: "${name}" vs. "${this.name}"!`
                );
            }
            this.name = name;
        }

        if (!adapt) {
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
        }

        this.#members.add(newMember);
    }

    /**
     * @param {ScaleResolutionMember} member
     * @returns {() => boolean}
     */
    registerMember(member) {
        this.#addMember(member);
        return () => {
            const removed = this.#members.delete(member);
            return removed && this.#members.size === 0;
        };
    }

    /**
     * Returns true if the domain has been defined explicitly, i.e. not extracted from the data.
     */
    #isExplicitDomain() {
        return this.#domainAggregator.hasConfiguredDomain();
    }

    #isDomainInitialized() {
        const s = this.#scaleManager.scale;
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
        return resolveScalePropsBase({
            channel: this.channel,
            dataType: this.type,
            members: this.#members,
            isExplicitDomain: this.#isExplicitDomain(),
        });
    }

    /**
     * Returns the merged scale properties supplemented with inferred properties
     * and domain.
     *
     * @param {boolean} [extractDataDomain]
     * @returns {import("../spec/scale.js").Scale}
     */
    #getScaleProps(extractDataDomain = false) {
        const props = this.#getMergedScaleProps();
        if (props === null || props.type == "null") {
            // No scale (pass-thru)
            // TODO: Check that the channel is compatible
            return { type: "null" };
        }

        const domain =
            this.#domainAggregator.getConfiguredOrDefaultDomain(
                extractDataDomain
            );

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

        return props;
    }

    /**
     * Extracts and unions the data domains of all participating views.
     *
     * @return { DomainArray }
     */
    getDataDomain() {
        return this.#domainAggregator.getDataDomain();
    }

    /**
     * Reconfigures the scale: updates domain and other settings
     */
    reconfigure() {
        const scale = this.#scaleManager.scale;

        if (!scale || scale.type == "null") {
            return;
        }

        const domainWasInitialized = this.#isDomainInitialized();
        const previousDomain = scale.domain();

        const props = this.#getScaleProps(true);
        this.#scaleManager.reconfigureScale(props);

        if (
            this.#domainAggregator.captureInitialDomain(
                scale,
                domainWasInitialized
            )
        ) {
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
        if (this.#scaleManager.scale) {
            return this.#scaleManager.scale;
        }

        const props = this.#getScaleProps();
        const scale = this.#scaleManager.createScale(props);

        if (isScaleLocus(scale)) {
            scale.genome(this.getGenome());
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
            shallowArrayEquals(
                this.#domainAggregator.getConfiguredOrDefaultDomain(),
                this.getDomain()
            )
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
        const zoomExtent = this.zoomExtent;
        newDomain = clampRange(newDomain, zoomExtent[0], zoomExtent[1]);

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
        const newDomain = this.#domainAggregator.getConfiguredOrDefaultDomain();

        if ([0, 1].some((i) => newDomain[i] != oldDomain[i])) {
            this.#scaleManager.scale.domain(newDomain);
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
            return span(this.zoomExtent) / span(this.scale.domain());
        }

        return 1.0;
    }

    /**
     * Returns the length of the axis in pixels. Chooses the smallest of the views.
     * They should all be the same, but some exotic configuration might break that assumption.
     *
     * This method is needed because positional channels have unit ranges and the
     * length of the axis is not directly available from the scale. Ideally, ranges would
     * be configured as pixels, but that is yet to be materialized.
     */
    getAxisLength() {
        if (this.channel !== "x" && this.channel !== "y") {
            throw new Error(
                "Axis length is only defined for x and y channels!"
            );
        }

        // Here's a problem: if the view has been hidden, it may have stale coords.
        // TODO: They should be cleared when the layout is invalidated.
        // Alternatively, scale ranges could be set in pixels.
        const lengths = Array.from(this.#members)
            .map(
                (m) =>
                    m.view.coords?.[this.channel === "x" ? "width" : "height"]
            )
            .filter((len) => len > 0);

        return lengths.length
            ? lengths.reduce((a, b) => Math.min(a, b), 10000)
            : 0;
    }

    /**
     * @returns {number[]}
     */
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
        }

        // TODO: Perhaps this should be "domain" for index scale and nothing for quantitative.
        // Would behave similarly to Vega-Lite, which doesn't have constraints.
        return this.#domainAggregator.initialDomainSnapshot;
    }

    /**
     * TODO: These actually depend on the mark, so this is clearly a wrong place.
     * And besides, these should be configurable (themeable)
     *
     * @param {string} dataType
     */

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
