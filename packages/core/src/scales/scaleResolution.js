import scaleLocus, {
    fromComplexInterval as locusFromComplexInterval,
    fromComplexValue,
    getGenomeExtent,
    toComplexInterval,
    toComplexValue,
} from "../genome/scaleLocus.js";
import scaleIndex from "../genome/scaleIndex.js";
import scaleNull from "../utils/scaleNull.js";

import { scale as vegaScale, isDiscrete, isContinuous } from "vega-scale";
import { configureDomain } from "../scale/scale.js";

import ScaleInstanceManager from "./scaleInstanceManager.js";
import { resolveScalePropsBase } from "./scalePropsResolver.js";
import ScaleDomainAggregator from "./scaleDomainAggregator.js";
import ScaleInteractionController from "./scaleInteractionController.js";
import {
    INDEX,
    LOCUS,
    NOMINAL,
    ORDINAL,
    QUANTITATIVE,
} from "./scaleResolutionConstants.js";

import { getAccessorDomainKey } from "../encoder/accessor.js";
import { isSecondaryChannel } from "../encoder/encoder.js";
import { NominalDomain } from "../utils/domainArray.js";
import { shallowArrayEquals } from "../utils/arrayUtils.js";
import createIndexer from "../utils/indexer.js";

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
 * @prop {import("../view/unitView.js").default} view TODO: Get rid of the view reference
 * @prop {T} channel
 * @prop {import("../spec/channel.js").ChannelDefWithScale} channelDef
 * @prop {boolean} contributesToDomain
 */
/**
 * Resolves a shared scale for a channel by merging scale properties and domains
 * across participating views, then coordinating range updates and zoom/pan
 * interactions. It is the central wiring point for scale-related state and
 * notifications, while delegating domain aggregation, scale instance setup, and
 * interaction logic to focused helpers.
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
     * @typedef {import("../view/unitView.js").default} UnitView
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

    /** @type {ScaleInteractionController} */
    #interactionController;

    /** @type {ReturnType<typeof createIndexer> | undefined} */
    #categoricalIndexer;

    #categoricalIndexerExplicit = false;

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
            getMembers: () => this.#getActiveMembers(),
            getType: () => this.type,
            getLocusExtent: () => this.#getLocusExtent(),
            fromComplexInterval: this.fromComplexInterval.bind(this),
        });

        this.#scaleManager = new ScaleInstanceManager({
            getParamMediator: () => this.#firstMemberView.paramMediator,
            onRangeChange: () => this.#notifyListeners("range"),
            onDomainChange: () => this.#notifyListeners("domain"),
            getGenomeStore: () => this.#viewContext.genomeStore,
        });

        this.#interactionController = new ScaleInteractionController({
            getScale: () => this.getScale(),
            getAnimator: () => this.#viewContext.animator,
            getInitialDomainSnapshot: () =>
                this.#domainAggregator.initialDomainSnapshot,
            getResetDomain: () =>
                this.#domainAggregator.getConfiguredOrDefaultDomain(),
            fromComplexInterval: this.fromComplexInterval.bind(this),
            getGenomeExtent: () => this.#getLocusExtent(),
        });
    }

    /**
     * @returns {import("../view/view.js").default}
     */
    get #firstMemberView() {
        const first = this.#members.values().next().value;
        if (!first) {
            throw new Error("ScaleResolution has no members!");
        }
        return first.view;
    }

    #getActiveMembers() {
        /** @type {Set<ScaleResolutionMember>} */
        const active = new Set();
        for (const member of this.#members) {
            const view = member.view;
            if (!view.isConfiguredVisible()) {
                continue;
            }
            if (
                !view.isDataInitialized() &&
                !member.channelDef?.scale?.domain
            ) {
                // Explicit domains should be honored even before data init.
                continue;
            }
            active.add(member);
        }
        return active;
    }

    get #viewContext() {
        return this.#firstMemberView.context;
    }

    get zoomExtent() {
        return (
            (this.#scaleManager.scale &&
                isContinuous(this.#scaleManager.scale.type) &&
                this.#interactionController.getZoomExtent()) ?? [
                -Infinity,
                Infinity,
            ]
        );
    }

    /**
     * @returns {number[]}
     */
    #getLocusExtent() {
        return getGenomeExtent(this.#getGenomeSource());
    }

    /**
     * @returns {import("../genome/scaleLocus.js").GenomeSource}
     */
    #getGenomeSource() {
        if (this.type !== LOCUS) {
            return undefined;
        }
        return /** @type {import("../genome/scaleLocus.js").GenomeSource} */ (
            this.#scaleManager.scale ?? this.#scaleManager.getLocusGenome()
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
     * @param {import("../data/collector.js").default} collector
     * @param {Iterable<import("../types/encoder.js").ScaleAccessor>} accessors
     * @returns {() => void}
     */
    registerCollectorSubscriptions(collector, accessors) {
        /** @type {Set<string>} */
        const domainKeys = new Set();

        for (const accessor of accessors) {
            if (accessor.channelDef.domainInert) {
                continue;
            }
            domainKeys.add(getAccessorDomainKey(accessor, this.type));
        }

        if (domainKeys.size === 0) {
            return () => undefined;
        }

        const listener = () => {
            this.reconfigureDomain();
        };

        /** @type {(() => void)[]} */
        const unregisters = [];
        for (const domainKey of domainKeys) {
            unregisters.push(
                collector.subscribeDomainChanges(domainKey, listener)
            );
        }

        return () => {
            for (const unregister of unregisters) {
                unregister();
            }
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

        if (isDiscrete(props.type)) {
            const isExplicit = this.#isExplicitDomain();
            const indexer = this.#getCategoricalIndexer(isExplicit);
            if (domain != null) {
                if (
                    isExplicit &&
                    indexer.domain().length > 0 &&
                    !shallowArrayEquals(indexer.domain(), domain)
                ) {
                    this.#categoricalIndexer = undefined;
                    return this.#getScaleProps(extractDataDomain);
                }
                indexer.addAll(domain);
                const active = new Set(domain);
                const indexedDomain = indexer
                    .domain()
                    .filter((value) => active.has(value));
                props.domain =
                    indexedDomain.length > 0
                        ? /** @type {import("../spec/scale.js").ScalarDomain} */ (
                              indexedDomain
                          )
                        : new NominalDomain();
            } else {
                const indexedDomain = indexer.domain();
                props.domain =
                    indexedDomain.length > 0
                        ? /** @type {import("../spec/scale.js").ScalarDomain} */ (
                              indexedDomain
                          )
                        : new NominalDomain();
            }
            // Scale props are spec-shaped; keep the indexer off the public type.
            /** @type {any} */ (props).domainIndexer = indexer;
        } else if (domain && domain.length > 0) {
            props.domain = domain;
        }

        if (!props.domain && props.domainMid !== undefined) {
            // Initialize with a bogus domain so that scale.js can inject the domainMid.
            // The number of domain elements must be know before the glsl scale is generated.
            props.domain = [props.domainMin ?? 0, props.domainMax ?? 1];
        }

        return props;
    }

    /**
     * @param {boolean} isExplicit
     */
    #getCategoricalIndexer(isExplicit) {
        if (
            !this.#categoricalIndexer ||
            this.#categoricalIndexerExplicit !== isExplicit
        ) {
            this.#categoricalIndexer = createIndexer();
            this.#categoricalIndexerExplicit = isExplicit;
        }
        return this.#categoricalIndexer;
    }

    /**
     * Reconfigures the scale: updates domain and other settings.
     *
     * Use this when the set of participating members changes (views added or removed),
     * or when scale properties are otherwise re-resolved from the view hierarchy.
     */
    reconfigure() {
        const props = this.#getScaleProps(true);
        this.#reconfigureWith(() => this.#scaleManager.reconfigureScale(props));
    }

    /**
     * Reconfigures only the effective domain (configured + data-derived).
     *
     * Use this when data changes but the scale membership and properties are stable.
     */
    reconfigureDomain() {
        const props = this.#getScaleProps(true);
        this.#reconfigureWith(() => {
            configureDomain(this.#scaleManager.scale, props);
        });
    }

    /**
     * @param {() => void} apply
     */
    #reconfigureWith(apply) {
        const scale = this.#scaleManager.scale;

        if (!scale || scale.type == "null") {
            return;
        }

        const domainWasInitialized = this.#isDomainInitialized();
        const previousDomain = scale.domain();

        this.#scaleManager.withDomainNotificationsSuppressed(apply);

        if (
            this.#domainAggregator.captureInitialDomain(
                scale,
                domainWasInitialized
            )
        ) {
            // Domain changes were suppressed during reconfigure; notify explicitly.
            this.#notifyListeners("domain");
            return;
        }

        const newDomain = scale.domain();
        if (!shallowArrayEquals(newDomain, previousDomain)) {
            if (this.isZoomable()) {
                // Don't mess with zoomed views, restore the previous domain
                this.#scaleManager.withDomainNotificationsSuppressed(() => {
                    scale.domain(previousDomain);
                });
            } else if (this.#interactionController.isZoomingSupported()) {
                // It can be zoomed, so lets make a smooth transition.
                // Restore the previous domain and zoom smoothly to the new domain.
                this.#scaleManager.withDomainNotificationsSuppressed(() => {
                    scale.domain(previousDomain);
                });
                this.zoomTo(newDomain, 500); // TODO: Configurable duration
            } else {
                // Update immediately if the previous domain was the initial domain [0, 0]
                // Notifications were suppressed during reconfigure; notify explicitly.
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
        throw new Error(
            "ScaleResolution.scale accessed before initialization. Call initializeScale()."
        );
    }

    /**
     * Returns the scale instance, creating it if needed.
     *
     * Use this from call sites that may run before explicit initialization.
     *
     * @returns {ScaleWithProps}
     */
    getScale() {
        return this.#scaleManager.scale ?? this.initializeScale();
    }

    /**
     * Initializes the scale instance once resolution has stabilized.
     *
     * @returns {ScaleWithProps}
     */
    initializeScale() {
        if (this.#scaleManager.scale) {
            return this.#scaleManager.scale;
        }

        const props = this.#getScaleProps();
        const scale = this.#scaleManager.createScale(props);

        return scale;
    }

    getDomain() {
        return this.getScale().domain();
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
     * @returns {NumericDomain | ComplexDomain}
     */
    getComplexDomain() {
        return /** @type {NumericDomain | ComplexDomain} */ (
            toComplexInterval(this.#getGenomeSource(), this.getDomain())
        );
    }

    /**
     * Return true if the scale is zoomable and the current domain differs from the initial domain.
     *
     * @returns true if zoomed
     */
    isZoomed() {
        return this.#interactionController.isZoomed();
    }

    /**
     * Returns true if zooming is supported and allowed in view spec.
     */
    isZoomable() {
        // Check explicit configuration
        return this.#interactionController.isZoomable();
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
        return this.#interactionController.zoom(scaleFactor, scaleAnchor, pan);
    }

    /**
     * Immediately zooms to the given interval.
     *
     * @param {NumericDomain | ComplexDomain} domain
     * @param {boolean | number} [duration] an approximate duration for transition.
     *      Zero duration zooms immediately. Boolean `true` indicates a default duration.
     */
    async zoomTo(domain, duration = false) {
        return this.#interactionController.zoomTo(domain, duration);
    }

    /**
     * Resets the current domain to the initial one
     *
     * @returns true if the domain was changed
     */
    resetZoom() {
        return this.#interactionController.resetZoom();
    }

    /**
     * Returns the zoom level with respect to the reference domain span (the original domain).
     *
     * In principle, this is highly specific to positional channels. However, zooming can
     * be generalized to other quantitative channels such as color, opacity, size, etc.
     */
    getZoomLevel() {
        return this.#interactionController.getZoomLevel();
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
        return toComplexValue(this.#getGenomeSource(), value);
    }

    /**
     * @param {number | ChromosomalLocus} complex
     * @returns {number}
     */
    fromComplex(complex) {
        return fromComplexValue(this.#getGenomeSource(), complex);
    }

    /**
     * @param {ScalarDomain | ComplexDomain} interval
     * @returns {number[]}
     */
    fromComplexInterval(interval) {
        if (this.type == LOCUS) {
            return locusFromComplexInterval(this.#getGenomeSource(), interval);
        }
        return /** @type {number[]} */ (interval);
    }
}
