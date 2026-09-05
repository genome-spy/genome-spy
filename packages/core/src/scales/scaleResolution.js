import deepEqual from "../utils/deepEqual.js";
import { createDomainState, planDomainUpdate } from "./domainLifecycle.js";
import { createCancelToken } from "../utils/transition.js";
import eerp from "../utils/eerp.js";
import { easeCubicInOut } from "d3-ease";
import { isDataReady } from "../data/dataReadiness.js";
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

import ScaleInstanceManager from "./scaleInstanceManager.js";
import { resolveScalePropsBase } from "./scalePropsResolver.js";
import DomainPlanner from "./domainPlanner.js";
import {
    getViewportConstraints,
    getViewportDependencies,
    isViewportDomainRef,
    isViewportDataReady,
    ViewportDomainScheduler,
} from "./viewportDomain.js";
import ScaleInteractionController from "./scaleInteractionController.js";
import { validateScaleTypeCompatibility } from "./scaleRules.js";
import {
    INDEX,
    LOCUS,
    NOMINAL,
    ORDINAL,
    QUANTITATIVE,
} from "./scaleResolutionConstants.js";

import { getAccessorDomainKey, isScaleAccessor } from "../encoder/accessor.js";
import { isExprRef } from "../paramRuntime/paramUtils.js";
import {
    getEncoderAccessors,
    isSecondaryChannel,
    primaryPositionalChannels,
} from "../encoder/encoder.js";
import { collectConfiguredDomainExprRefs } from "./domainExpressions.js";
import { NominalDomain } from "../utils/domainArray.js";
import { shallowArrayEquals } from "../utils/arrayUtils.js";
import createIndexer from "../utils/indexer.js";
import { getCachedOrCall, invalidate } from "../utils/propertyCacher.js";
import { resolveUrl } from "../utils/url.js";
import { orderResolutionMembers } from "./resolutionMemberOrder.js";
import { getResolutionOwnerPrecedence } from "./resolutionOwnerPrecedence.js";
import {
    findIntervalSelectionBindingOwners,
    getIntervalSelection,
    normalizeIntervalForSelection,
    resolveIntervalSelectionBinding,
} from "./selectionDomainUtils.js";
import { toExternalIndexLikeInterval } from "./indexLikeDomainUtils.js";
import { isInChromeSubtree } from "../view/viewChrome.js";

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

    /** @type {import("./domainLifecycle.js").DomainState | undefined} */
    #domainState;

    /** @type {{ canceled: boolean } | undefined} */
    #transitionToken;

    /** Exact outgoing selection object, scoped around synchronous publication.
     * @type {unknown}
     */
    #selectionWrite;

    #domainNotificationSerial = 0;

    /** @type {Set<() => void>} */
    #zoomExtentListeners = new Set();

    /** Latest unlinked fallback; refreshed with source snapshots, never on frames.
     * @type {any[]}
     */
    #selectionFallbackDomain = [];

    /** @type {ScaleResolutionMember[] | undefined} */
    #orderedMembers;

    /**
     * @type {Record<ScaleResolutionEventType, Set<ScaleResolutionListener>>}
     */
    #listeners = {
        domain: new Set(),
        range: new Set(),
    };

    /** @type {ViewportDomainScheduler} */
    #viewportDomainScheduler;

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

    /** @type {(() => void)[]} */
    #configuredDomainExprUnsubscribers = [];

    #ignoreSelectionInitial = false;

    /** @type {[number, number] | null | undefined} */
    #lastLinkedSelectionInterval = undefined;

    /** @type {import("../view/view.js").default | undefined} */
    #hostView;

    /**
     * @type {{ view: import("../view/view.js").default, props: import("../spec/scale.js").Scale } | undefined}
     */
    #viewLevelScaleProps;

    #resolvingScaleProps = 0;

    #memberRegistrationBatchDepth = 0;

    #membersDirty = false;

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
            getViewLevelDomainSource: () => this.#getViewLevelDomainSource(),
            createExpression: (expr) => this.#createExpression(expr),
            resolveSelectionBinding: (paramName, encoding) =>
                this.#resolveSelectionBinding(paramName, encoding),
            getViewportConstraints: (member) =>
                this.#getViewportConstraints(member),
            getType: () => this.type,
            getLocusExtent: (assembly) => this.#getLocusExtent(assembly),
            fromComplexInterval: this.fromComplexInterval.bind(this),
        });

        this.#viewportDomainScheduler = new ViewportDomainScheduler({
            hasViewportDomain: () => this.#domainAggregator.hasViewportDomain(),
            getDependencies: () =>
                getViewportDependencies(this.#dataDomainMembers, this),
            isReady: () =>
                isViewportDataReady(
                    this.#getActiveMembers(this.#dataDomainMembers),
                    (member) => this.#getViewportConstraints(member)
                ),
            update: () => this.reconfigureDomain("viewport"),
        });

        this.#scaleManager = new ScaleInstanceManager({
            createExpression: (expr) => this.#createExpression(expr),
            onRangeChange: () => this.#notifyListeners("range"),
            onDomainChange: (domain) => {
                void this.#commitDomainUpdate({ type: "set", domain });
            },
            getGenomeStore: () => this.#viewContext.genomeStore,
        });

        this.#interactionController = new ScaleInteractionController({
            getScale: () => this.getScale(),
            navigate: (domain, duration, renderImmediately = false) =>
                this.#commitDomainUpdate(
                    {
                        type: "navigate",
                        domain,
                        duration,
                    },
                    !renderImmediately
                ),
            renderImmediately: () => this.#viewContext.renderImmediately(),
            getInitialDomainSnapshot: () =>
                /** @type {number[]} */ (this.#domainState.initialReference),
            getDataZoomExtent: () =>
                /** @type {number[]} */ (this.#domainState.dataExtent),
            getResetDomain: () =>
                /** @type {number[]} */ (this.#domainState.resetDomain),
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

    get #expressionScopeView() {
        if (!this.#viewLevelScaleProps) {
            /** @type {import("../view/view.js").default | undefined} */
            let memberView;
            for (const member of this.#members) {
                if (isInChromeSubtree(member.view)) {
                    // TODO(#413): Use the consolidated internal guide/chrome
                    // contract instead of checking view classification here.
                    continue;
                }
                if (!memberView) {
                    memberView = member.view;
                } else if (member.view !== memberView) {
                    return this.#resolutionView;
                }
            }

            if (memberView) {
                // TODO(v2.0): Remove this compatibility fallback and always
                // bind scale expressions to the resolution owner's scope.
                return memberView;
            }
        }

        return this.#resolutionView;
    }

    /**
     * Binds an ordinary scale expression through its effective parameter
     * scope.
     *
     * @param {string} expr
     * @returns {import("../paramRuntime/types.js").ExprRefFunction}
     */
    #createExpression(expr) {
        try {
            return this.#expressionScopeView.paramRuntime.createExpression(
                expr
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "";
            const match = /^Unknown variable "([^"]+)" in expression: /.exec(
                message
            );
            if (!match) {
                throw error;
            }

            throw this.#createParameterScopeError(match[1], error);
        }
    }

    /**
     * @param {string} paramName
     * @param {"x" | "y"} encoding
     */
    #resolveSelectionBinding(paramName, encoding) {
        try {
            return resolveIntervalSelectionBinding(
                this.#expressionScopeView,
                paramName,
                encoding
            );
        } catch (error) {
            if (
                !(error instanceof Error) ||
                error.message !==
                    `Selection domain parameter "${paramName}" was not found.`
            ) {
                throw error;
            }
            throw this.#createParameterScopeError(paramName, error);
        }
    }

    /**
     * @param {string} paramName
     * @param {unknown} cause
     */
    #createParameterScopeError(paramName, cause) {
        const expressionScopeView = this.#expressionScopeView;
        const shared =
            expressionScopeView === this.#resolutionView &&
            (this.#members.size > 1 ||
                Array.from(this.#members).some(
                    (member) => member.view !== this.#resolutionView
                ));
        return new Error(
            `Parameter "${paramName}" is not visible from the ${shared ? "shared " : ""}${this.channel} scale resolution. ` +
                `Move the parameter to the resolution-owning view and use push: "outer" if a child must update it.`,
            { cause }
        );
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
            const domain = member.channelDef?.scale?.domain;
            if (
                !view.isDataInitialized() &&
                (domain === undefined || isViewportDomainRef(domain))
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
     * Progress of the zoom reference/extent can change without a displayed-domain
     * event. Internal consumers subscribe here in addition to domain changes.
     * @param {() => void} listener
     * @returns {() => void}
     */
    subscribeZoomExtent(listener) {
        this.#zoomExtentListeners.add(listener);
        return () => this.#zoomExtentListeners.delete(listener);
    }

    /**
     * @param {ScaleResolutionEventType} type
     */
    #notifyListeners(type) {
        const displayed = this.#domainState?.visibleDomain;
        if (type === "domain") {
            this.#domainNotificationSerial++;
        }
        for (const listener of this.#listeners[type].values()) {
            listener({ type, scaleResolution: this });
            if (
                type === "domain" &&
                this.#domainState.visibleDomain !== displayed
            ) {
                // A nested commit already notified listeners of its replacement.
                break;
            }
        }
    }

    syncLinkedSelectionFromDomain() {
        const linkInfo =
            this.#domainAggregator.getSelectionConfiguredDomainBindingInfo();
        if (!linkInfo || !this.isZoomable()) {
            return;
        }

        const selection = getIntervalSelection(
            linkInfo.runtime.getValue(linkInfo.param),
            linkInfo.param
        );
        if (!selection) {
            return;
        }

        const interval = this.#normalizeDomainIntervalForLinkedSelection(
            this.getScale().domain()
        );
        if (!interval) {
            return;
        }

        const fallbackInterval =
            this.#normalizeDomainIntervalForLinkedSelection(
                this.#selectionFallbackDomain
            );

        const syncedInterval =
            fallbackInterval && shallowArrayEquals(interval, fallbackInterval)
                ? null
                : interval;

        const previousInterval = selection.intervals[linkInfo.encoding] ?? null;
        if (intervalsEqual(previousInterval, syncedInterval)) {
            return;
        }

        const outgoing = {
            ...selection,
            type: /** @type {const} */ ("interval"),
            intervals: {
                ...selection.intervals,
                [linkInfo.encoding]: syncedInterval,
            },
        };
        const previousWrite = this.#selectionWrite;
        this.#selectionWrite = outgoing;
        try {
            linkInfo.runtime.setValue(linkInfo.param, outgoing);
        } finally {
            this.#selectionWrite = previousWrite;
        }
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
        const viewLevelDomain = this.#viewLevelScaleProps?.props.domain;
        if (
            viewLevelDomain !== undefined &&
            !isViewportDomainRef(viewLevelDomain)
        ) {
            return true;
        }

        for (const member of this.#members) {
            const domain = member.channelDef.scale?.domain;
            if (
                member.contributesToDomain &&
                domain !== undefined &&
                !isViewportDomainRef(domain)
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
        const selection = getIntervalSelection(
            linkInfo.runtime.getValue(linkInfo.param),
            linkInfo.param
        );
        if (!selection) {
            return null;
        }
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

        this.#assertCanRegisterMember(member);

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

        validateScaleTypeCompatibility(
            this.channel,
            type,
            effectiveScaleType,
            `encoding.${channel}.scale.type`
        );

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
        return member;
    }

    #syncMembers() {
        this.#membersDirty = false;
        this.#invalidateOrderedMembers();
        this.#invalidateConfiguredDomain();
        this.#refreshSelectionDomainParamSubscriptions();
        this.#refreshConfiguredDomainExprSubscriptions();
        this.#viewportDomainScheduler.refresh();
        if (this.#scaleManager.scale && this.#members.size > 0) {
            this.reconfigure();
        }
    }

    #markMembersDirty() {
        if (this.#memberRegistrationBatchDepth > 0) {
            this.#membersDirty = true;
        } else {
            this.#syncMembers();
        }
    }

    /**
     * Resolves member-owned expressions before a registration batch can
     * reconfigure any live scale.
     */
    #preflightMemberSync() {
        this.#invalidateOrderedMembers();
        this.#invalidateConfiguredDomain();

        const range = this.#getMergedScaleProps().range;
        // New resolutions bind expressions when first initialized, after the
        // authored hierarchy exists. Keep preflight atomic for live mutations.
        if (!this.#scaleManager.scale) {
            return;
        }
        // Validate domain expressions too, without changing any live scales.
        this.#getConfiguredOrDefaultDomain();
        if (Array.isArray(range)) {
            for (const value of range) {
                if (isExprRef(value)) {
                    this.#createExpression(value.expr);
                }
            }
        }
    }

    /**
     * Executes a group of member registrations without refreshing derived
     * membership state until the callback completes.
     *
     * @template T
     * @param {Iterable<ScaleResolution>} resolutions
     * @param {() => T} callback
     * @returns {T}
     */
    static registerInBatch(resolutions, callback) {
        const batchedResolutions = Array.from(resolutions);
        let memberSyncStarted = false;
        const snapshots = batchedResolutions.map((resolution) => ({
            resolution,
            members: new Set(resolution.#members),
            dataDomainMembers: new Set(resolution.#dataDomainMembers),
            type: resolution.type,
            name: resolution.name,
            batchDepth: resolution.#memberRegistrationBatchDepth,
            membersDirty: resolution.#membersDirty,
        }));
        for (const resolution of batchedResolutions) {
            resolution.#memberRegistrationBatchDepth++;
        }

        try {
            const result = callback();
            for (const resolution of batchedResolutions) {
                resolution.#memberRegistrationBatchDepth--;
            }

            const resolutionsToSync = batchedResolutions.filter(
                (resolution) =>
                    resolution.#memberRegistrationBatchDepth === 0 &&
                    resolution.#membersDirty
            );
            for (const resolution of resolutionsToSync) {
                resolution.#preflightMemberSync();
            }

            memberSyncStarted = true;
            for (const resolution of resolutionsToSync) {
                resolution.#syncMembers();
            }
            return result;
        } catch (error) {
            for (const snapshot of snapshots) {
                const resolution = snapshot.resolution;
                resolution.#members = snapshot.members;
                resolution.#dataDomainMembers = snapshot.dataDomainMembers;
                resolution.type = snapshot.type;
                resolution.name = snapshot.name;
                resolution.#memberRegistrationBatchDepth = snapshot.batchDepth;
                resolution.#membersDirty = snapshot.membersDirty;
            }

            if (memberSyncStarted) {
                // A failed reconfigure may already have replaced scale props or
                // listeners. Restore every affected resolution before surfacing
                // the original registration error.
                try {
                    for (const snapshot of snapshots) {
                        const resolution = snapshot.resolution;
                        if (snapshot.batchDepth === 0) {
                            resolution.#syncMembers();
                        } else {
                            resolution.#membersDirty = true;
                        }
                    }
                } catch (rollbackError) {
                    if (error && typeof error === "object") {
                        /** @type {any} */ (error).rollbackError =
                            rollbackError;
                    }
                }
            } else {
                for (const snapshot of snapshots) {
                    snapshot.resolution.#invalidateOrderedMembers();
                    snapshot.resolution.#invalidateConfiguredDomain();
                }
            }

            throw error;
        }
    }

    /**
     * @param {ScaleResolutionMember} member
     * @returns {() => boolean}
     */
    registerMember(member) {
        const registeredMember = this.#addMember(member);
        this.#markMembersDirty();
        return () => {
            const removed = this.#members.delete(registeredMember);
            if (removed) {
                this.#dataDomainMembers.delete(registeredMember);
                this.#markMembersDirty();
            }
            return removed && this.#members.size === 0;
        };
    }

    /**
     * @param {import("../view/view.js").default} view
     * @param {import("../spec/scale.js").Scale} props
     */
    attachViewLevelScaleProps(view, props) {
        if (
            this.#viewLevelScaleProps &&
            this.#viewLevelScaleProps.view !== view
        ) {
            const precedence = getResolutionOwnerPrecedence(
                this.#viewLevelScaleProps.view,
                view
            );
            if (precedence === "current") {
                return;
            } else if (precedence === "conflict") {
                throw new Error(
                    `Multiple view-level scale declarations target the same ${this.channel} scale resolution.`
                );
            }
        }

        for (const member of this.#members) {
            this.#assertMemberHasNoScaleProps(member);
        }

        const previousProps = this.#viewLevelScaleProps?.props;
        this.#viewLevelScaleProps = { view, props };
        this.#invalidateMergedScaleProps();
        this.#invalidateConfiguredDomain();
        this.#refreshSelectionDomainParamSubscriptions();
        this.#refreshConfiguredDomainExprSubscriptions();
        this.#viewportDomainScheduler.refresh();
        this.#recreateInitializedScale(
            domainConfigurationChanged(previousProps, props)
                ? "configuration"
                : "membership"
        );
    }

    /**
     * @param {import("../view/view.js").default} view
     */
    clearViewLevelScaleProps(view) {
        if (this.#viewLevelScaleProps?.view === view) {
            const previousProps = this.#viewLevelScaleProps.props;
            this.#viewLevelScaleProps = undefined;
            this.#invalidateMergedScaleProps();
            this.#invalidateConfiguredDomain();
            this.#refreshSelectionDomainParamSubscriptions();
            this.#refreshConfiguredDomainExprSubscriptions();
            this.#viewportDomainScheduler.refresh();
            this.#recreateInitializedScale(
                domainConfigurationChanged(previousProps, undefined)
                    ? "configuration"
                    : "membership"
            );
        }
    }

    /** @param {"configuration" | "membership"} reason */
    #recreateInitializedScale(reason) {
        if (!this.#scaleManager.scale) {
            return;
        }

        this.#scaleManager.resetScale();
        this.initializeScale();
        this.#updateDomainSource(reason, true);
    }

    /**
     * @returns {{ view: import("../view/view.js").default, props: import("../spec/scale.js").Scale } | undefined}
     */
    getViewLevelScaleProps() {
        return this.#viewLevelScaleProps;
    }

    #getViewLevelDomainSource() {
        const viewLevelScaleProps = this.#viewLevelScaleProps;
        if (!viewLevelScaleProps) {
            return undefined;
        }

        return {
            channel:
                /** @type {import("../spec/channel.js").ChannelWithScale} */ (
                    this.channel
                ),
            type: this.type,
            domain: viewLevelScaleProps.props.domain,
        };
    }

    /**
     * @param {ScaleResolutionMember} member
     * @returns {{ channel: "x" | "y", domain: [number, number], accessor: import("../types/encoder.js").Accessor, accessor2?: import("../types/encoder.js").Accessor }[]}
     */
    #getViewportConstraints(member) {
        return getViewportConstraints(
            member,
            this,
            /** @type {ChannelWithScale} */ (this.channel),
            (resolution) =>
                this.#hasVisibleDependencyPath(resolution, new Set())
        );
    }

    /**
     * @param {ScaleResolution} resolution
     * @param {Set<ScaleResolution>} visited
     */
    #hasVisibleDependencyPath(resolution, visited) {
        if (resolution === this) {
            return true;
        }
        if (
            visited.has(resolution) ||
            !resolution.#domainAggregator.hasViewportDomain()
        ) {
            return false;
        }

        visited.add(resolution);
        for (const member of resolution.#dataDomainMembers) {
            for (const channel of primaryPositionalChannels) {
                const dependency = member.view.getScaleResolution(channel);
                if (
                    dependency &&
                    dependency !== resolution &&
                    this.#hasVisibleDependencyPath(dependency, visited)
                ) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * @param {ScaleResolutionMember} member
     */
    #assertCanRegisterMember(member) {
        if (!this.#viewLevelScaleProps) {
            return;
        }

        this.#assertMemberHasNoScaleProps(member);
    }

    /**
     * @param {ScaleResolutionMember} member
     */
    #assertMemberHasNoScaleProps(member) {
        if (member.channelDef.scale === undefined) {
            return;
        }

        throw new Error(
            `Cannot mix view-level scales.${this.channel} with encoding.${member.channel}.scale in the same scale resolution.`
        );
    }

    dispose() {
        this.#clearSelectionDomainParamSubscriptions();
        this.#clearConfiguredDomainExprSubscriptions();
        this.#viewportDomainScheduler.clear();
        this.#zoomExtentListeners.clear();
        this.#listeners.domain.clear();
        this.#listeners.range.clear();
        this.#cancelDomainTransition();
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
                if (
                    this.#selectionWrite !== undefined &&
                    linkInfo.runtime.getValue(linkInfo.param) ===
                        this.#selectionWrite
                ) {
                    // Own frame echoes update the reset target without rescanning
                    // contributors or re-normalizing an authored domain.
                    void this.#commitDomainUpdate({
                        type: "selection-sync",
                        candidate: this.#domainState.visibleDomain,
                        resetDomain: this.#scaleManager.normalizeDomain(
                            this.#getConfiguredOrDefaultDomain()
                        ),
                        referenceDomain: this.#domainState.initialReference,
                        dataExtent: this.#domainState.dataExtent,
                        readiness:
                            this.#domainState.phase === "ready"
                                ? "ready"
                                : "pending",
                    });
                } else {
                    this.reconfigureDomain("selection");
                }
            })
        );
    }

    #refreshConfiguredDomainExprSubscriptions() {
        this.#clearConfiguredDomainExprSubscriptions();

        if (this.#members.size === 0 || !this.#scaleManager.scale) {
            return;
        }

        const listener = () => {
            this.#invalidateConfiguredDomain();
            this.reconfigureDomain("expression");
        };

        for (const member of this.#members) {
            if (!member.contributesToDomain) {
                continue;
            }
            const domain = member.channelDef.scale?.domain;
            const exprRefs = collectConfiguredDomainExprRefs(domain);
            if (exprRefs.length === 0) {
                continue;
            }

            for (const exprRef of exprRefs) {
                const expr = this.#createExpression(exprRef.expr);
                const unsubscribe = expr.subscribe(listener);
                this.#configuredDomainExprUnsubscribers.push(unsubscribe);
            }
        }

        const viewLevelDomain = this.#viewLevelScaleProps?.props.domain;
        const viewLevelExprRefs =
            collectConfiguredDomainExprRefs(viewLevelDomain);
        for (const exprRef of viewLevelExprRefs) {
            const expr = this.#createExpression(exprRef.expr);
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
     * Finalizes the initial domain after every visible non-constant domain
     * contributor has completed real input, including empty results. Apply partial domains
     * directly instead of visibly transitioning between them.
     *
     * @returns {boolean} whether the initial domain was finalized now
     */
    #isInitialDataReady() {
        for (const member of this.#dataDomainMembers) {
            const view = member.view;
            if (!view.isConfiguredVisible()) {
                continue;
            }
            if (!view.isDataInitialized()) {
                const domain = member.channelDef.scale?.domain;
                if (domain === undefined || isViewportDomainRef(domain)) {
                    return false;
                }
                continue;
            }
            if (!this.#hasInitialDomainDataCoverage(member)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param {ScaleResolutionMember} member
     */
    #hasInitialDomainDataCoverage(member) {
        if (!member.view.mark.encoders?.[member.channel]) {
            return false;
        }

        const accessors = getScaleMemberAccessors(member).filter(
            (accessor) => !accessor.constant && !accessor.channelDef.domainInert
        );
        if (accessors.length === 0) {
            return true;
        }

        const collector = member.view.getCollector();
        return !!collector && isDataReady(collector);
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
            if (
                this.#domainAggregator.hasViewportDomain() &&
                this.#domainState?.phase === "ready"
            ) {
                this.#viewportDomainScheduler.schedule(true);
            } else {
                this.reconfigureDomain();
            }
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
                viewLevelScaleProps: this.#viewLevelScaleProps,
                isExplicitDomain: this.isDomainDefinedExplicitly(),
                configScopes: this.#resolutionView.getConfigScopes(),
                getOwnerScaleResolution: (channel) =>
                    this.#resolutionView.getScaleResolution(channel),
            });
            this.#validateLinkedSelectionConfiguration(props);
            this.#validateViewportDomainConfiguration(props);
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

    /**
     * Returns the participating members in the same deterministic order used
     * for scale property merging.
     *
     * @returns {ScaleResolutionMember[]}
     */
    getOrderedMembers() {
        return this.#getOrderedMembers().slice();
    }

    getDebugState() {
        const scale = this.#scaleManager.scale;
        const canReadDomain = scale && typeof scale.domain === "function";
        const canReadRange = scale && typeof scale.range === "function";

        return {
            kind: "scale",
            channel: this.channel,
            hostView: this.#resolutionView,
            name: this.name,
            type: this.type,
            resolvedScaleType: this.getResolvedScaleType(),
            domain: canReadDomain ? this.getDomain() : undefined,
            complexDomain: canReadDomain ? this.getComplexDomain() : undefined,
            range: canReadRange ? scale.range() : undefined,
            zoomable: this.isZoomable(),
            zoomed: this.isZoomable() ? this.isZoomed() : false,
            members: this.#getOrderedMembers().map((member) =>
                this.#createDebugMember(member)
            ),
            activeMemberCount: this.#getActiveMembers().size,
            dataDomainMemberCount: this.#dataDomainMembers.size,
            viewLevelScaleProps: this.#viewLevelScaleProps
                ? {
                      view: this.#viewLevelScaleProps.view,
                      props: structuredClone(this.#viewLevelScaleProps.props),
                  }
                : undefined,
        };
    }

    /**
     * @param {ScaleResolutionMember} member
     */
    #createDebugMember(member) {
        return {
            view: member.view,
            channel: member.channel,
            channelDef: structuredClone(member.channelDef),
            contributesToDomain: member.contributesToDomain,
            active: this.#getActiveMembers().has(member),
        };
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
     * @param {import("../spec/scale.js").Scale} props
     */
    #validateViewportDomainConfiguration(props) {
        if (
            !this.#domainAggregator.hasViewportDomain() ||
            props === null ||
            props.type === "null"
        ) {
            return;
        }

        if (!isContinuous(props.type) || isDiscrete(props.type)) {
            throw new Error(
                `Viewport-derived domains require a continuous ${this.channel} scale.`
            );
        }

        if ((this.channel === "x" || this.channel === "y") && props.zoom) {
            throw new Error(
                `Viewport-derived domains cannot target a zoomable ${this.channel} scale.`
            );
        }
    }

    /**
     * Returns locus assembly requirements without initializing the scale.
     *
     * This is intentionally side-effect free: it only inspects explicit scale
     * properties from registered members and does not resolve domains or
     * instantiate scale instances.
     *
     * @returns {{
     *   assembly: import("../spec/scale.js").Scale["assembly"] | undefined,
     *   needsDefaultAssembly: boolean
     * }}
     */
    getAssemblyRequirement() {
        if (this.type !== LOCUS) {
            return {
                assembly: undefined,
                needsDefaultAssembly: false,
            };
        }

        const scaleProps = this.#viewLevelScaleProps
            ? [this.#viewLevelScaleProps.props]
            : this.#getOrderedMembers()
                  .map((member) => member.channelDef.scale)
                  .filter((props) => props !== undefined);

        if (
            scaleProps.some((props) => props === null || props.type === "null")
        ) {
            return {
                assembly: undefined,
                needsDefaultAssembly: false,
            };
        }

        const assembly = scaleProps.find(
            (props) => props?.assembly !== undefined
        )?.assembly;

        return {
            assembly,
            needsDefaultAssembly: assembly === undefined,
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
        this.#invalidateConfiguredDomain();
        this.#updateDomainSource("membership", true);
    }

    /**
     * @param {import("./domainLifecycle.js").DomainSourceUpdate["type"]} [reason]
     */
    reconfigureDomain(reason = "data") {
        this.#updateDomainSource(reason, false);
    }

    /** @returns {import("./domainLifecycle.js").DomainPolicy} */
    #domainPolicy() {
        const scale = this.scale;
        return {
            zoomable: this.#interactionController.isZoomable(),
            scaleKind:
                scale.type === INDEX
                    ? "index"
                    : isContinuous(scale.type) && !isDiscrete(scale.type)
                      ? "continuous"
                      : "discrete",
            rendered: this.#hasRenderedMember(),
            animateChanges: scale.props.domainTransition !== false,
            selectionLinked:
                this.#domainAggregator.hasSelectionConfiguredDomain(),
        };
    }

    /**
     * @param {import("./domainLifecycle.js").DomainSourceUpdate["type"]} reason
     * @param {boolean} full
     */
    #updateDomainSource(reason, full) {
        const scale = this.#scaleManager.scale;
        if (!scale || scale.type === "null") {
            return;
        }
        const props = this.#getScaleProps(true);
        const domainConfig = this.#scaleManager.prepareDomain(props);
        if (full) {
            this.#scaleManager.configureProperties(props);
        }
        if (domainConfig.applyOrdinalUnknown) {
            /** @type {any} */ (scale).unknown(domainConfig.ordinalUnknown);
        }
        const initialReady =
            this.#domainState.phase === "ready" || this.#isInitialDataReady();
        let candidate = domainConfig.domain ?? undefined;
        if (
            reason === "viewport" &&
            !isViewportDataReady(
                this.#getActiveMembers(this.#dataDomainMembers),
                (member) => this.#getViewportConstraints(member)
            )
        ) {
            candidate = undefined;
        }
        const linked = this.#domainAggregator.hasSelectionConfiguredDomain();
        if (linked) {
            this.#selectionFallbackDomain =
                this.#domainAggregator.getDefaultDomain(true);
        }
        const dataExtent =
            typeof props.zoom === "object" && props.zoom.extent === "data"
                ? !this.#hasConfiguredDomain() && this.type !== LOCUS
                    ? Array.isArray(props.domain) && props.domain.length
                        ? Array.from(/** @type {number[]} */ (props.domain))
                        : undefined
                    : this.#domainAggregator.getDataZoomExtent()
                : undefined;
        void this.#commitDomainUpdate({
            type: reason,
            candidate,
            resetDomain: this.#scaleManager.normalizeDomain(
                this.#getConfiguredOrDefaultDomain()
            ),
            referenceDomain: linked ? this.#selectionFallbackDomain : candidate,
            dataExtent: /** @type {number[]} */ (dataExtent),
            readiness: initialReady ? "ready" : "pending",
        });
        if (
            full &&
            this.#scaleManager.scale === scale &&
            scale.props === props
        ) {
            this.#scaleManager.configureRange(props);
        }
    }

    /**
     * Installs state before effects. Benign synchronous selection echoes may
     * replace state without superseding its display or transition identity.
     * @param {import("./domainLifecycle.js").DomainUpdate} update
     * @param {boolean} [requestRender]
     * @returns {Promise<void>}
     */
    #commitDomainUpdate(update, requestRender = true) {
        if ("domain" in update) {
            update = {
                ...update,
                domain: this.#scaleManager.normalizeDomain(update.domain),
            };
        }
        const previous = this.#domainState;
        const plan = planDomainUpdate(previous, update, this.#domainPolicy());
        this.#domainState = plan.state;
        if (plan.transition.type !== "none") {
            this.#cancelDomainTransition();
        }
        if (plan.domainChanged) {
            this.#scaleManager.mirrorDomain(plan.state.visibleDomain);
        }
        const notified = this.#domainNotificationSerial;
        if (plan.syncSelection) {
            this.syncLinkedSelectionFromDomain();
        }
        if (
            plan.domainChanged &&
            this.#domainState.visibleDomain === plan.state.visibleDomain &&
            this.#domainNotificationSerial === notified
        ) {
            this.#notifyListeners("domain");
        }
        if (
            !plan.domainChanged &&
            (!deepEqual(
                previous.initialReference,
                this.#domainState.initialReference
            ) ||
                !deepEqual(previous.dataExtent, this.#domainState.dataExtent))
        ) {
            for (const listener of this.#zoomExtentListeners) {
                listener();
            }
        }
        if (
            plan.transition.type === "start" &&
            this.#domainState.transition?.id === plan.transition.id
        ) {
            return this.#animateDomain(plan.transition);
        }
        if (plan.domainChanged && requestRender) {
            this.#viewContext.animator.requestRender();
        }
        return Promise.resolve();
    }

    #cancelDomainTransition() {
        if (this.#transitionToken) {
            this.#transitionToken.canceled = true;
            this.#transitionToken = undefined;
        }
    }

    /** @param {Extract<import("./domainLifecycle.js").TransitionAction, { type: "start" }>} action */
    async #animateDomain(action) {
        const from = /** @type {readonly number[]} */ (action.from);
        const to = /** @type {readonly number[]} */ (action.to);
        const fw = from[1] - from[0];
        const tw = to[1] - to[0];
        const fc = from[0] + fw / 2;
        const tc = to[0] + tw / 2;
        const token = createCancelToken();
        this.#transitionToken = token;
        await this.#viewContext.animator.transition({
            duration: action.duration,
            easingFunction: easeCubicInOut,
            cancelToken: token,
            onUpdate: (t) => {
                if (token.canceled) {
                    return;
                }
                const w = eerp(fw, tw, t);
                const wt = fw === tw ? t : (fw - w) / (fw - tw);
                const c = wt * tc + (1 - wt) * fc;
                void this.#commitDomainUpdate({
                    type: "frame",
                    id: action.id,
                    domain: [
                        from[0] === to[0] ? from[0] : c - w / 2,
                        from[1] === to[1] ? from[1] : c + w / 2,
                    ],
                });
            },
        });
        if (!token.canceled && this.#domainState.transition?.id === action.id) {
            this.#transitionToken = undefined;
            await this.#commitDomainUpdate({ type: "finish", id: action.id });
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
     * Creating the scale resolves default domains and may require loaded
     * assemblies for locus scales. For side-effect-free type checks, use
     * `getResolvedScaleType()`.
     *
     * @returns {ScaleWithProps}
     */
    getScale() {
        if (this.#resolvingScaleProps > 0) {
            throw new Error(
                `Scale dependency cycle: channel "${this.channel}" cannot read its own scale while its domain is being resolved.`
            );
        }
        if (this.#scaleManager.initializingRange) {
            throw new Error(
                `Scale dependency cycle: channel "${this.channel}" reads its scale while its range is being initialized.`
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
        const previousState = this.#domainState;
        try {
            const scale = this.#scaleManager.createScale(props, (domain) => {
                if (!this.#domainState) {
                    this.#domainState = createDomainState(
                        domain,
                        this.#scaleManager.normalizeDomain(
                            this.#getConfiguredOrDefaultDomain()
                        )
                    );
                } else {
                    this.#scaleManager.mirrorDomain(
                        this.#domainState.visibleDomain
                    );
                }
            });
            this.#refreshConfiguredDomainExprSubscriptions();
            return scale;
        } catch (error) {
            this.#clearConfiguredDomainExprSubscriptions();
            this.#scaleManager.resetScale();
            this.#domainState = previousState;
            throw error;
        }
    }

    /** @returns {any[]} A fresh snapshot of the committed display. */
    getDomain() {
        if (this.#resolvingScaleProps > 0) {
            throw new Error(
                `Scale dependency cycle: channel "${this.channel}" cannot read its own domain while its domain is being resolved.`
            );
        }
        // The underlying scale getter returns a fresh array. Treat this as a
        // read-only snapshot rather than a mutable backing store.
        // Domain configuration precedes range binding. Reading that domain
        // from this scale's range expression is acyclic and must be allowed.
        if (!this.#scaleManager.scale) {
            this.initializeScale();
        }
        return Array.from(this.#domainState.visibleDomain);
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
     * Returns true when the scale has an explicitly configured bounded zoom
     * extent whose boundary ticks can be identified independently of the
     * current viewport domain.
     */
    hasConfiguredZoomExtent() {
        const zoom = this.#getMergedScaleProps().zoom;
        return (
            typeof zoom == "object" &&
            zoom.extent !== undefined &&
            zoom.extent !== "unbounded"
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
     * @param {import("../types/scaleResolutionApi.js").ZoomToOptions | boolean | number} [options]
     *      Zoom options. Passing the duration directly as a boolean or number is deprecated.
     */
    async zoomTo(domain, options = false) {
        return this.#interactionController.zoomTo(domain, options);
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
            return locusFromComplexInterval(
                this.#getGenomeSource(this.getAssemblyRequirement().assembly),
                interval
            );
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
 * @param {ScaleResolutionMember} member
 * @returns {import("../types/encoder.js").ScaleAccessor[]}
 */
function getScaleMemberAccessors(member) {
    const encoder = member.view.mark.encoders?.[member.channel];
    return encoder ? getEncoderAccessors(encoder).filter(isScaleAccessor) : [];
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

/**
 * Authored-domain authority comes from a changed declaration, not range-only
 * recreation or a different data-derived candidate.
 * @param {import("../spec/scale.js").Scale | undefined} previous
 * @param {import("../spec/scale.js").Scale | undefined} next
 */
function domainConfigurationChanged(previous, next) {
    return [
        "domain",
        "domainMin",
        "domainMid",
        "domainMax",
        "domainRaw",
        "nice",
        "zero",
        "padding",
        "exponent",
        "constant",
        "assembly",
        "type",
    ].some((key) => {
        const property = /** @type {keyof import("../spec/scale.js").Scale} */ (
            key
        );
        const a = previous?.[property];
        const b = next?.[property];
        return !deepEqual(a, b);
    });
}
