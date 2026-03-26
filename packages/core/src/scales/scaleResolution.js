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
import DomainPlanner from "./domainPlanner.js";
import ScaleInteractionController from "./scaleInteractionController.js";
import {
    INDEX,
    LOCUS,
    NOMINAL,
    ORDINAL,
    QUANTITATIVE,
} from "./scaleResolutionConstants.js";

import { getAccessorDomainKey } from "../encoder/accessor.js";
import {
    isPrimaryPositionalChannel,
    isSecondaryChannel,
} from "../encoder/encoder.js";
import { isExprRef } from "../paramRuntime/paramUtils.js";
import { NominalDomain } from "../utils/domainArray.js";
import { shallowArrayEquals } from "../utils/arrayUtils.js";
import createIndexer from "../utils/indexer.js";
import { getCachedOrCall, invalidate } from "../utils/propertyCacher.js";
import { resolveUrl } from "../utils/url.js";
import { orderResolutionMembers } from "./resolutionMemberOrder.js";
import {
    findIntervalSelectionBindingOwners,
    normalizeIntervalForSelection,
    requireIntervalSelection,
} from "./selectionDomainUtils.js";
import { toExternalIndexLikeInterval } from "./indexLikeDomainUtils.js";

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
 * Documentation overview of current concerns this class (and its helpers) deal with:
 * - Resolution membership and rules (shared/independent/forced/excluded, visibility, registration).
 * - Scale property aggregation (merge props, channel overrides, unique scale names).
 * - Domain computation and caching (configured/data unions, defaults, indexer stability, subscriptions).
 * - Scale instance lifecycle (create, reconfigure props, apply domains, notify changes).
 * - Interaction and zoom (zoom/pan/reset coordination, snapshots, zoom extents).
 * - Rendering integration (range textures, axis sizing/positioning).
 * - Locus-specific conversions (complex intervals, genome extent bindings).
 * - Diagnostics and edge cases (ordinal unknown, nice/zero/padding, log warnings).
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

    /** @type {Set<ScaleResolutionMember>} */
    #dataDomainMembers = new Set();

    /** @type {ScaleResolutionMember[] | undefined} */
    #orderedMembers;

    /**
     * @type {Record<ScaleResolutionEventType, Set<ScaleResolutionListener>>}
     */
    #listeners = {
        domain: new Set(),
        range: new Set(),
    };

    /** @type {ScaleInstanceManager} */
    #scaleManager;

    /** @type {DomainPlanner} */
    #domainAggregator;

    /** @type {ScaleInteractionController} */
    #interactionController;

    /** @type {ReturnType<typeof createIndexer> | undefined} */
    #categoricalIndexer;

    #categoricalIndexerExplicit = false;

    /** @type {(() => void)[]} */
    #selectionDomainParamUnsubscribers = [];

    #selectionReverseSyncSuppressionDepth = 0;

    /** @type {(() => void)[]} */
    #configuredDomainExprUnsubscribers = [];

    #ignoreSelectionInitial = false;

    /** @type {[number, number] | null | undefined} */
    #lastLinkedSelectionInterval = undefined;

    /** @type {import("../view/view.js").default | undefined} */
    #hostView;

    #resolvingScaleProps = 0;

    /**
     * @param {Channel} channel
     * @param {import("../view/view.js").default} [hostView]
     */
    constructor(channel, hostView) {
        this.channel = channel;
        /** @type {import("../spec/channel.js").Type} Data type (quantitative, nominal, etc...) */
        this.type = null;

        /** @type {string} An optional unique identifier for the scale */
        this.name = undefined;

        this.#hostView = hostView;

        this.#domainAggregator = new DomainPlanner({
            getActiveMembers: () => this.#getActiveMembers(),
            getAllMembers: () => this.#members,
            getDataMembers: () =>
                this.#getActiveMembers(this.#dataDomainMembers),
            getType: () => this.type,
            getLocusExtent: (assembly) => this.#getLocusExtent(assembly),
            fromComplexInterval: this.fromComplexInterval.bind(this),
        });

        this.#scaleManager = new ScaleInstanceManager({
            getParamRuntime: () => this.#resolutionView.paramRuntime,
            onRangeChange: () => this.#notifyListeners("range"),
            onDomainChange: () => this.#notifyListeners("domain"),
            getGenomeStore: () => this.#viewContext.genomeStore,
        });

        this.#interactionController = new ScaleInteractionController({
            getScale: () => this.getScale(),
            getAnimator: () => this.#viewContext.animator,
            getInitialDomainSnapshot: () =>
                this.#domainAggregator.initialDomainSnapshot,
            getResetDomain: () => this.#getConfiguredOrDefaultDomain(),
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

    get #resolutionView() {
        return this.#hostView ?? this.#firstMemberView;
    }

    /**
     * @param {Set<ScaleResolutionMember>} [members]
     */
    #getActiveMembers(members = this.#members) {
        /** @type {Set<ScaleResolutionMember>} */
        const active = new Set();
        for (const member of members) {
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
        return this.#resolutionView.context;
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
     * @param {import("../spec/scale.js").Scale["assembly"]} [assembly]
     * @returns {number[]}
     */
    #getLocusExtent(assembly) {
        return getGenomeExtent(this.#getGenomeSource(assembly));
    }

    /**
     * @param {import("../spec/scale.js").Scale["assembly"]} [assembly]
     * @returns {import("../genome/scaleLocus.js").GenomeSource}
     */
    #getGenomeSource(assembly) {
        if (this.type !== LOCUS) {
            return undefined;
        }
        return /** @type {import("../genome/scaleLocus.js").GenomeSource} */ (
            this.#scaleManager.scale ??
                this.#scaleManager.getLocusGenome(assembly)
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
        if (
            type === "domain" &&
            this.#selectionReverseSyncSuppressionDepth === 0
        ) {
            this.syncLinkedSelectionFromDomain();
        }

        for (const listener of this.#listeners[type].values()) {
            listener({
                type,
                scaleResolution: this,
            });
        }
    }

    /**
     * @param {() => void} callback
     */
    #withSelectionReverseSyncSuppressed(callback) {
        this.#selectionReverseSyncSuppressionDepth += 1;
        try {
            callback();
        } finally {
            this.#selectionReverseSyncSuppressionDepth -= 1;
        }
    }

    syncLinkedSelectionFromDomain() {
        const linkInfo =
            this.#domainAggregator.getSelectionConfiguredDomainBindingInfo();
        if (!linkInfo || !this.isZoomable()) {
            return;
        }

        const selection = requireIntervalSelection(
            linkInfo.runtime.getValue(linkInfo.param),
            linkInfo.param
        );

        const interval = this.#normalizeDomainIntervalForLinkedSelection(
            this.getScale().domain()
        );
        if (!interval) {
            return;
        }

        const fallbackInterval =
            this.#normalizeDomainIntervalForLinkedSelection(
                this.#domainAggregator.getDefaultDomain(true)
            );

        const syncedInterval =
            fallbackInterval && shallowArrayEquals(interval, fallbackInterval)
                ? null
                : interval;

        const previousInterval = selection.intervals[linkInfo.encoding] ?? null;
        if (intervalsEqual(previousInterval, syncedInterval)) {
            return;
        }

        linkInfo.runtime.setValue(linkInfo.param, {
            ...selection,
            type: "interval",
            intervals: {
                ...selection.intervals,
                [linkInfo.encoding]: syncedInterval,
            },
        });
    }

    /**
     * @param {any[]} domain
     * @returns {[number, number] | undefined}
     */
    #normalizeDomainIntervalForLinkedSelection(domain) {
        return normalizeIntervalForSelection(domain, this.zoomExtent);
    }

    #getLinkedSelectionInfo() {
        return this.#domainAggregator.getSelectionConfiguredDomainBindingInfo();
    }

    #shouldIncludeSelectionInitial() {
        return !this.#ignoreSelectionInitial;
    }

    /**
     * @param {boolean} [extractDataDomain]
     * @param {import("../spec/scale.js").Scale["assembly"]} [locusAssembly]
     * @returns {any[]}
     */
    #getConfiguredOrDefaultDomain(extractDataDomain = false, locusAssembly) {
        return this.#domainAggregator.getConfiguredOrDefaultDomain(
            extractDataDomain,
            locusAssembly,
            {
                includeSelectionInitial: this.#shouldIncludeSelectionInitial(),
            }
        );
    }

    /**
     * @returns {boolean}
     */
    #hasConfiguredDomain() {
        for (const member of this.#members) {
            if (
                member.contributesToDomain &&
                member.channelDef.scale?.domain !== undefined
            ) {
                return true;
            }
        }
        return false;
    }

    /**
     * @param {import("./domainPlanner.js").SelectionDomainLinkInfo} linkInfo
     * @returns {[number, number] | null}
     */
    #getCurrentLinkedSelectionInterval(linkInfo) {
        const selection = requireIntervalSelection(
            linkInfo.runtime.getValue(linkInfo.param),
            linkInfo.param
        );
        const interval = selection.intervals[linkInfo.encoding];
        return interval && interval.length === 2
            ? /** @type {[number, number]} */ (interval)
            : null;
    }

    /**
     * @param {[number, number] | null} previousInterval
     * @param {[number, number] | null} nextInterval
     */
    #updateSelectionInitialBypass(previousInterval, nextInterval) {
        if (nextInterval) {
            this.#ignoreSelectionInitial = false;
        } else if (previousInterval) {
            this.#ignoreSelectionInitial = true;
        }
    }

    /**
     * Add a view to this resolution.
     * N.B. This is expected to be called in depth-first order
     *
     * @param {ScaleResolutionMember} newMember
     * @returns {ScaleResolutionMember}
     */
    #addMember(newMember) {
        const member = normalizeMember(newMember);
        const { channel, channelDef } = member;

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
        const explicitScaleType = channelDef.scale?.type;
        const effectiveScaleType =
            explicitScaleType ??
            (type === INDEX || type === LOCUS ? type : undefined);

        if (
            effectiveScaleType &&
            [INDEX, LOCUS].includes(effectiveScaleType) &&
            !isPrimaryPositionalChannel(this.channel)
        ) {
            throw new Error(
                `Index and locus scales are only supported on positional channels (x/y). Channel "${this.channel}" resolves to scale type "${effectiveScaleType}".`
            );
        }

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
                // TODO: Revisit shared discrete positional scales when
                // implementing Vega-Lite-like band-vs-point inference.
                // Nominal/ordinal members should be able to share a scale even
                // if one member wants "point" and another wants "band"; the
                // merged result should resolve to "band". Explicit
                // user-specified incompatible scale types should still error.
                // TODO: Include a reference to the layer
                throw new Error(
                    `Can not use shared scale for different data types: ${this.type} vs. ${type}. Use "resolve: independent" for channel ${this.channel}`
                );
            }
        }

        this.#members.add(member);
        if (member.contributesToDomain) {
            this.#dataDomainMembers.add(member);
        }
        this.#invalidateOrderedMembers();
        this.#invalidateConfiguredDomain();
        this.#refreshSelectionDomainParamSubscriptions();
        this.#refreshConfiguredDomainExprSubscriptions();
        return member;
    }

    /**
     * @param {ScaleResolutionMember} member
     * @returns {() => boolean}
     */
    registerMember(member) {
        const registeredMember = this.#addMember(member);
        return () => {
            const removed = this.#members.delete(registeredMember);
            if (removed) {
                this.#dataDomainMembers.delete(registeredMember);
                this.#invalidateOrderedMembers();
                this.#invalidateConfiguredDomain();
                this.#refreshSelectionDomainParamSubscriptions();
                this.#refreshConfiguredDomainExprSubscriptions();
            }
            return removed && this.#members.size === 0;
        };
    }

    dispose() {
        this.#clearSelectionDomainParamSubscriptions();
        this.#clearConfiguredDomainExprSubscriptions();
        this.#listeners.domain.clear();
        this.#listeners.range.clear();
        this.#scaleManager.dispose();
    }

    #clearSelectionDomainParamSubscriptions() {
        for (const unsubscribe of this.#selectionDomainParamUnsubscribers) {
            unsubscribe();
        }
        this.#selectionDomainParamUnsubscribers = [];
        this.#lastLinkedSelectionInterval = undefined;
    }

    #clearConfiguredDomainExprSubscriptions() {
        for (const unsubscribe of this.#configuredDomainExprUnsubscribers) {
            unsubscribe();
        }
        this.#configuredDomainExprUnsubscribers = [];
    }

    #refreshSelectionDomainParamSubscriptions() {
        this.#clearSelectionDomainParamSubscriptions();

        if (this.#members.size === 0) {
            return;
        }

        const linkInfo = this.#getLinkedSelectionInfo();
        if (!linkInfo) {
            return;
        }

        this.#lastLinkedSelectionInterval =
            this.#getCurrentLinkedSelectionInterval(linkInfo);

        this.#selectionDomainParamUnsubscribers.push(
            linkInfo.runtime.subscribe(linkInfo.param, () => {
                const previousInterval = this.#lastLinkedSelectionInterval;
                const currentInterval =
                    this.#getCurrentLinkedSelectionInterval(linkInfo);
                this.#updateSelectionInitialBypass(
                    previousInterval,
                    currentInterval
                );
                this.#lastLinkedSelectionInterval = currentInterval;
                this.#invalidateConfiguredDomain();
                this.reconfigureDomain();
            })
        );
    }

    #refreshConfiguredDomainExprSubscriptions() {
        this.#clearConfiguredDomainExprSubscriptions();

        if (this.#members.size === 0) {
            return;
        }

        const listener = () => {
            this.#invalidateConfiguredDomain();
            this.reconfigureDomain();
        };

        for (const member of this.#members) {
            if (!member.contributesToDomain) {
                continue;
            }
            const domain = member.channelDef.scale?.domain;
            if (!isExprRef(domain)) {
                continue;
            }

            const expr = member.view.paramRuntime.createExpression(domain.expr);
            const unsubscribe = expr.subscribe(listener);
            this.#configuredDomainExprUnsubscribers.push(unsubscribe);
        }
    }

    #hasRenderedMember() {
        for (const member of this.#members) {
            if (member.view.hasRendered()) {
                return true;
            }
        }
        return false;
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
    isDomainDefinedExplicitly() {
        return this.#hasConfiguredDomain();
    }

    isDomainInitialized() {
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
        return getCachedOrCall(this, "mergedScaleProps", () => {
            const props = resolveScalePropsBase({
                channel: this.channel,
                dataType: this.type,
                orderedMembers: this.#getOrderedMembers(),
                isExplicitDomain: this.isDomainDefinedExplicitly(),
                configScopes: this.#resolutionView.getConfigScopes(),
            });
            this.#validateLinkedSelectionConfiguration(props);
            return props;
        });
    }

    #invalidateMergedScaleProps() {
        invalidate(this, "mergedScaleProps");
    }

    #invalidateOrderedMembers() {
        this.#orderedMembers = undefined;
    }

    /**
     * Returns the participating members in a stable order.
     *
     * The membership set changes rarely, so cache the sorted order separately
     * from merged scale props. That keeps parameter-driven domain updates from
     * re-running the same path-based sort work.
     *
     * @returns {ScaleResolutionMember[]}
     */
    #getOrderedMembers() {
        if (!this.#orderedMembers) {
            this.#orderedMembers = orderResolutionMembers(this.#members);
        }
        return this.#orderedMembers;
    }

    #invalidateConfiguredDomain() {
        this.#domainAggregator.invalidateConfiguredDomain();
        this.#invalidateMergedScaleProps();
    }

    /**
     * @param {import("../spec/scale.js").Scale} props
     */
    #validateLinkedSelectionConfiguration(props) {
        const linkInfo = this.#getLinkedSelectionInfo();
        if (!linkInfo || props === null || props.type === "null") {
            return;
        }

        const isZoomable =
            isContinuous(props.type) && !isDiscrete(props.type) && !!props.zoom;

        if (linkInfo.hasInitial && !isZoomable) {
            throw new Error(
                `Selection domain reference "${linkInfo.param}.${linkInfo.encoding}" cannot use "initial" with a non-zoomable ${this.channel} scale. ` +
                    `Enable zoom on the linked scale or remove "initial".`
            );
        }
    }

    /**
     * Returns locus assembly requirements without initializing the scale.
     *
     * This is intentionally side-effect free: it only inspects merged scale
     * properties from registered members and does not touch default domains or
     * instantiate scale instances.
     *
     * @returns {{
     *   assembly: import("../spec/scale.js").Scale["assembly"] | undefined,
     *   needsDefaultAssembly: boolean
     * }}
     */
    getAssemblyRequirement() {
        const props = this.#getMergedScaleProps();
        if (props === null || props.type === "null" || props.type !== LOCUS) {
            return {
                assembly: undefined,
                needsDefaultAssembly: false,
            };
        }

        return {
            assembly: props.assembly,
            needsDefaultAssembly: props.assembly === undefined,
        };
    }

    /**
     * Returns the resolved scale type without instantiating the scale.
     *
     * Useful during view construction, before assembly preflight has loaded
     * URL-backed locus genomes.
     *
     * @returns {import("../spec/scale.js").Scale["type"] | undefined}
     */
    getResolvedScaleType() {
        const props = this.#getMergedScaleProps();
        if (props === null || props.type === "null") {
            return undefined;
        }

        return props.type;
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

        const resolvedProps = { ...props };

        this.#resolvingScaleProps += 1;
        let domain;
        try {
            domain = this.#getConfiguredOrDefaultDomain(
                extractDataDomain,
                resolvedProps.type === LOCUS
                    ? resolvedProps.assembly
                    : undefined
            );
        } finally {
            this.#resolvingScaleProps -= 1;
        }

        if (isDiscrete(resolvedProps.type)) {
            const isExplicit = this.isDomainDefinedExplicitly();
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
                resolvedProps.domain =
                    indexedDomain.length > 0
                        ? /** @type {import("../spec/scale.js").ScalarDomain} */ (
                              indexedDomain
                          )
                        : new NominalDomain();
            } else {
                const indexedDomain = indexer.domain();
                resolvedProps.domain =
                    indexedDomain.length > 0
                        ? /** @type {import("../spec/scale.js").ScalarDomain} */ (
                              indexedDomain
                          )
                        : new NominalDomain();
            }
            // Scale props are spec-shaped; keep the indexer off the public type.
            /** @type {any} */ (resolvedProps).domainIndexer = indexer;
        } else if (domain && domain.length > 0) {
            resolvedProps.domain = domain;
        }

        if (!resolvedProps.domain && resolvedProps.domainMid !== undefined) {
            // Initialize with a bogus domain so that scale.js can inject the domainMid.
            // The number of domain elements must be know before the glsl scale is generated.
            resolvedProps.domain = [
                resolvedProps.domainMin ?? 0,
                resolvedProps.domainMax ?? 1,
            ];
        }

        return resolvedProps;
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
        this.#withSelectionReverseSyncSuppressed(() => {
            this.#invalidateConfiguredDomain();
            const state = this.#computeScaleState(true);
            if (!state) {
                return;
            }
            this.#applyReconfigure(state, (scale, props) =>
                this.#scaleManager.reconfigureScale(props)
            );
            this.#finalizeReconfigure(state);
        });
    }

    /**
     * Reconfigures only the effective domain (configured + data-derived).
     *
     * Use this when data changes but the scale membership and properties are stable.
     *
     */
    reconfigureDomain() {
        this.#withSelectionReverseSyncSuppressed(() => {
            const state = this.#computeScaleState(true, true);
            if (!state) {
                return;
            }
            const { domainConfig, targetDomain } = state;
            const domainMatches =
                targetDomain != null &&
                shallowArrayEquals(targetDomain, state.scale.domain());

            if (targetDomain != null && !domainMatches) {
                this.#applyReconfigure(state, (scale) => {
                    scale.domain(targetDomain);
                    if (domainConfig.applyOrdinalUnknown) {
                        // Keep ordinal unknown handling close to the domain write so
                        // domainImplicit semantics stay aligned with the applied domain.
                        /** @type {any} */ (scale).unknown(
                            domainConfig.ordinalUnknown
                        );
                    }
                });
            }
            this.#finalizeReconfigure(state);
            this.syncLinkedSelectionFromDomain();
        });
    }

    /**
     * @param {boolean} extractDataDomain
     * @param {boolean} [includeDomainConfig]
     * @returns {{
     *     scale: ScaleWithProps,
     *     props: import("../spec/scale.js").Scale,
     *     previousDomain: any[],
     *     domainWasInitialized: boolean,
     *     hasSelectionConfiguredDomain: boolean,
     *     domainConfig?: ReturnType<typeof configureDomain>,
     *     targetDomain?: any[] | null,
     * } | undefined}
     */
    #computeScaleState(extractDataDomain, includeDomainConfig = false) {
        const scale = this.#scaleManager.scale;

        if (!scale || scale.type == "null") {
            return;
        }

        const state = {
            scale,
            props: this.#getScaleProps(extractDataDomain),
            previousDomain: scale.domain(),
            domainWasInitialized: this.isDomainInitialized(),
            hasSelectionConfiguredDomain:
                this.#domainAggregator.hasSelectionConfiguredDomain(),
        };

        if (includeDomainConfig) {
            const domainConfig = configureDomain(scale, state.props);
            return {
                ...state,
                domainConfig,
                targetDomain: domainConfig.domain,
            };
        }

        return state;
    }

    /**
     * @param {{
     *     scale: ScaleWithProps,
     *     props: import("../spec/scale.js").Scale,
     * }} inputs
     * @param {(scale: ScaleWithProps, props: import("../spec/scale.js").Scale) => void} apply
     */
    #applyReconfigure(inputs, apply) {
        this.#scaleManager.withDomainNotificationsSuppressed(() => {
            apply(inputs.scale, inputs.props);
        });
    }

    /**
     * @param {{
     *     scale: ScaleWithProps,
     *     previousDomain: any[],
     *     domainWasInitialized: boolean,
     *     hasSelectionConfiguredDomain: boolean,
     * }} inputs
     */
    #finalizeReconfigure(inputs) {
        const {
            scale,
            previousDomain,
            domainWasInitialized,
            hasSelectionConfiguredDomain,
        } = inputs;

        const initialDomainSnapshot = hasSelectionConfiguredDomain
            ? this.#domainAggregator.getDefaultDomain(true)
            : undefined;

        if (
            this.#domainAggregator.captureInitialDomain(
                scale,
                domainWasInitialized,
                initialDomainSnapshot
            )
        ) {
            // Domain changes were suppressed during reconfigure; notify explicitly.
            this.#notifyListeners("domain");
            return;
        }

        const newDomain = scale.domain();
        const action = this.#interactionController.getDomainChangeAction(
            previousDomain,
            newDomain
        );

        if (action === "restore") {
            if (hasSelectionConfiguredDomain) {
                // Selection-linked domains are the source of truth and must not
                // be overridden by previously zoomed domains.
                this.#notifyListeners("domain");
            } else {
                // Don't mess with zoomed views, restore the previous domain
                this.#scaleManager.withDomainNotificationsSuppressed(() => {
                    scale.domain(previousDomain);
                });
            }
        } else if (action === "animate") {
            if (hasSelectionConfiguredDomain) {
                // Linked domains can update continuously (e.g., brushing), so
                // skip zoomTo transitions and apply domain updates directly.
                this.#notifyListeners("domain");
            } else if (this.#hasRenderedMember()) {
                // It can be zoomed, so lets make a smooth transition.
                // Restore the previous domain and zoom smoothly to the new domain.
                this.#scaleManager.withDomainNotificationsSuppressed(() => {
                    scale.domain(previousDomain);
                });
                this.zoomTo(newDomain, 500); // TODO: Configurable duration
            } else {
                this.#notifyListeners("domain");
            }
        } else if (action === "notify") {
            // Update immediately if the previous domain was the initial domain [0, 0]
            // Notifications were suppressed during reconfigure; notify explicitly.
            this.#notifyListeners("domain");
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
        if (this.#resolvingScaleProps > 0) {
            throw new Error(
                `Scale resolution for channel "${this.channel}" cannot read its own scale while its domain is being resolved.`
            );
        }
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
        if (this.#resolvingScaleProps > 0) {
            throw new Error(
                `Scale resolution for channel "${this.channel}" cannot read its own domain while its domain is being resolved.`
            );
        }
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
            toComplexInterval(
                this.#getGenomeSource(),
                toExternalIndexLikeInterval(this.type, this.getDomain())
            )
        );
    }

    /**
     * Returns metadata about a selection-linked domain, if present.
     */
    getLinkedSelectionDomainInfo() {
        const linkInfo = this.#getLinkedSelectionInfo();
        if (!linkInfo) {
            return;
        }

        const root = this.#resolutionView.getLayoutAncestors().at(-1);
        const persist = root
            ? findIntervalSelectionBindingOwners(
                  root,
                  linkInfo.runtime,
                  linkInfo.param,
                  linkInfo.encoding
              ).some((owner) => owner.param.persist !== false)
            : false;

        return {
            param: linkInfo.param,
            encoding: linkInfo.encoding,
            persist,
        };
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
        const props = this.#getMergedScaleProps();
        if (props === null || props.type === "null") {
            return false;
        }

        return (
            isContinuous(props.type) && !isDiscrete(props.type) && !!props.zoom
        );
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

/**
 * @param {number[] | null} a
 * @param {number[] | null} b
 * @returns {boolean}
 */
function intervalsEqual(a, b) {
    if (a === b) {
        return true;
    }

    if (!a || !b) {
        return false;
    }

    return a.length === b.length && shallowArrayEquals(a, b);
}

/**
 * Normalizes member-specific scale URLs so that inline `scale.assembly.url`
 * values resolve against the member view's base URL before scale props are
 * merged.
 *
 * @template {ChannelWithScale}[T=ChannelWithScale]
 * @param {ScaleResolutionMember<T>} member
 * @returns {ScaleResolutionMember<T>}
 */
function normalizeMember(member) {
    const scale = member.channelDef.scale;
    const assembly = scale?.assembly;
    if (!scale || !assembly || typeof assembly !== "object") {
        return member;
    }

    if (!("url" in assembly)) {
        return member;
    }

    const resolvedUrl = resolveUrl(member.view.getBaseUrl(), assembly.url);
    if (resolvedUrl === assembly.url) {
        return member;
    }

    return {
        ...member,
        channelDef: {
            ...member.channelDef,
            scale: {
                ...scale,
                assembly: {
                    ...assembly,
                    url: resolvedUrl,
                },
            },
        },
    };
}
