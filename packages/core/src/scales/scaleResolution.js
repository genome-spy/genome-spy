import deepEqual from "../utils/deepEqual.js";
import DomainRuntime from "./domainRuntime.js";
import createDomainInputs from "./domainInputs.js";
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
import {
    getScaleMemberAccessors,
    resolveConfiguredDomain,
    resolveDataDomain,
    resolveDefaultDomain,
    resolveSelectionDomainInfo,
    validateSharedSelectionDomain,
} from "./domainPlanner.js";
import {
    getViewportConstraints,
    getViewportDependencies,
    isViewportDomainRef,
    resolveVisibleDataDomain,
    validateSharedViewportDomain,
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

import { isExprRef } from "../paramRuntime/paramUtils.js";
import {
    isSecondaryChannel,
    primaryPositionalChannels,
} from "../encoder/encoder.js";
import { getCachedOrCall, invalidate } from "../utils/propertyCacher.js";
import { resolveUrl } from "../utils/url.js";
import { orderResolutionMembers } from "./resolutionMemberOrder.js";
import { getResolutionOwnerPrecedence } from "./resolutionOwnerPrecedence.js";
import {
    findIntervalSelectionBindingOwners,
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

    /** @type {DomainRuntime | undefined} */
    #domainRuntime;

    /** @type {ReturnType<typeof createDomainInputs> | undefined} */
    #domainInputs;

    get #domainState() {
        return this.#domainRuntime?.state;
    }

    /** @type {Set<() => void>} */
    #zoomExtentListeners = new Set();

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

    /** @type {ScaleInteractionController} */
    #interactionController;

    #ignoreSelectionInitial = false;

    /** @type {import("../view/view.js").default | undefined} */
    #hostView;

    /**
     * @type {{ view: import("../view/view.js").default, props: import("../spec/scale.js").Scale } | undefined}
     */
    #viewLevelScaleProps;

    #resolvingScaleProps = 0;

    #registeringMembers = false;

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
            renderImmediately: () => this.#domainRuntime.renderImmediately(),
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
     * Publishes zoom inputs during domain propagation, before observer effects.
     * Covers display, initial reference and loaded-extent changes.
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
        const runtime = this.#resolutionView.paramRuntime;
        runtime.runInTransaction(() => {
            for (const listener of this.#listeners[type].values()) {
                listener({ type, scaleResolution: this });
            }
        });
        runtime.flushNow();
    }

    syncLinkedSelectionFromDomain() {
        this.#domainInputs?.syncSelection();
    }

    #getLinkedSelectionInfo() {
        const link = resolveSelectionDomainInfo(
            this.#getActiveMembers(),
            this.#getViewLevelDomainSource(),
            (param, encoding) => this.#resolveSelectionBinding(param, encoding)
        );
        validateSharedSelectionDomain(this.#members, link);
        return link;
    }

    #hasViewportDomain() {
        return validateSharedViewportDomain(
            this.#members,
            this.#getViewLevelDomainSource()
        );
    }

    #shouldIncludeSelectionInitial() {
        return !(
            this.#domainInputs?.ignoreSelectionInitial ??
            this.#ignoreSelectionInitial
        );
    }

    /**
     * @param {import("../spec/scale.js").Scale["assembly"]} [locusAssembly]
     * @returns {any[]}
     */
    #getConfiguredOrDefaultDomain(locusAssembly) {
        return (
            resolveConfiguredDomain(
                this.#getActiveMembers(),
                this.#getViewLevelDomainSource(),
                (expr) => this.#createExpression(expr),
                (param, encoding) =>
                    this.#resolveSelectionBinding(param, encoding),
                this.fromComplexInterval.bind(this),
                this.#shouldIncludeSelectionInitial()
            ).domain ??
            resolveDefaultDomain(
                this.type,
                (assembly) => this.#getLocusExtent(assembly),
                undefined,
                locusAssembly
            )
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
        this.#invalidateOrderedMembers();
        this.#invalidateMergedScaleProps();

        if (this.#scaleManager.scale && this.#members.size > 0) {
            this.reconfigure();
        }
    }

    #onMembersChanged() {
        if (!this.#registeringMembers) {
            this.#syncMembers();
        }
    }

    /**
     * Resolves member-owned expressions before a registration batch can
     * reconfigure any live scale.
     */
    #preflightMemberSync() {
        this.#invalidateOrderedMembers();
        this.#invalidateMergedScaleProps();

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
     * membership state until the callback completes. Each supplied resolution
     * receives registrations; overlapping registration batches are unsupported.
     *
     * @template T
     * @param {Iterable<ScaleResolution>} resolutions
     * @param {() => T} callback
     * @returns {T}
     */
    static registerInBatch(resolutions, callback) {
        const batchedResolutions = Array.from(resolutions);
        if (
            batchedResolutions.some(
                (resolution) => resolution.#registeringMembers
            )
        ) {
            throw new Error(
                "Overlapping scale registration batches are not supported."
            );
        }
        let memberSyncStarted = false;
        const snapshots = batchedResolutions.map((resolution) => ({
            resolution,
            members: new Set(resolution.#members),
            dataDomainMembers: new Set(resolution.#dataDomainMembers),
            type: resolution.type,
            name: resolution.name,
        }));
        for (const resolution of batchedResolutions) {
            resolution.#registeringMembers = true;
        }

        try {
            const result = callback();
            for (const resolution of batchedResolutions) {
                resolution.#registeringMembers = false;
            }

            for (const resolution of batchedResolutions) {
                resolution.#preflightMemberSync();
            }

            memberSyncStarted = true;
            for (const resolution of batchedResolutions) {
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
                resolution.#registeringMembers = false;
                resolution.#invalidateOrderedMembers();
                resolution.#invalidateMergedScaleProps();
            }

            if (memberSyncStarted) {
                // A failed reconfigure may already have replaced scale props or
                // listeners. Restore every affected resolution before surfacing
                // the original registration error.
                try {
                    for (const resolution of batchedResolutions) {
                        resolution.#syncMembers();
                    }
                } catch (rollbackError) {
                    if (error && typeof error === "object") {
                        /** @type {any} */ (error).rollbackError =
                            rollbackError;
                    }
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
        this.#onMembersChanged();
        return () => {
            const removed = this.#members.delete(registeredMember);
            if (removed) {
                this.#dataDomainMembers.delete(registeredMember);
                this.#onMembersChanged();
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
        if (visited.has(resolution) || !resolution.#hasViewportDomain()) {
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
        this.#domainInputs?.dispose();
        this.#zoomExtentListeners.clear();
        this.#listeners.domain.clear();
        this.#listeners.range.clear();
        this.#domainRuntime?.dispose();
        this.#scaleManager.dispose();
    }

    /**
     * Rebind after configuration, membership, or encoder initialization changes.
     * The binding owns input subscriptions; DomainRuntime retains displayed-domain
     * state and animation across replacements. Ordinary data/parameter updates
     * use the installed binding instead of resolving membership again.
     * @internal
     */
    bindDomainInputs() {
        // Preserve only input history. Drop queued snapshots from the old binding
        // and its subscriptions; public navigation commands remain with the owner.
        const lastVisible = this.#domainInputs?.lastVisible;
        this.#domainRuntime?.cancelSourceUpdates();
        if (this.#domainInputs) {
            this.#ignoreSelectionInitial =
                this.#domainInputs.ignoreSelectionInitial;
            this.#domainInputs.dispose();
            this.#domainInputs = undefined;
        }

        const scale = this.#scaleManager.scale;
        if (!scale || scale.type === "null" || !this.#members.size) return;

        const members = new Set(
            this.#members
                .values()
                .filter((member) => member.view.isConfiguredVisible())
        );
        const dataMembers = new Set(
            this.#dataDomainMembers
                .values()
                .filter((member) => member.view.isConfiguredVisible())
        );

        const props = this.#getMergedScaleProps();
        const link = this.#getLinkedSelectionInfo();
        const viewport = this.#hasViewportDomain();

        // Pass resolved participants/configuration and scope-aware readers into
        // one replaceable binding. It derives source snapshots for the owner;
        // creating it does not itself request an initial source publication.
        this.#domainInputs = createDomainInputs({
            owner: this.#domainRuntime,
            manager: this.#scaleManager,
            props,
            explicit: this.#hasConfiguredDomain(),
            type: this.type,
            members,
            dataMembers,
            viewLevelDomain: this.#getViewLevelDomainSource(),
            createExpression: (expr) => this.#createExpression(expr),
            resolveSelectionBinding: (param, encoding) =>
                this.#resolveSelectionBinding(param, encoding),
            fromComplexInterval: this.fromComplexInterval.bind(this),
            getLocusExtent: (assembly) => this.#getLocusExtent(assembly),
            link,
            viewport,
            viewportDependencies: viewport
                ? getViewportDependencies(dataMembers, this)
                : new Set(),
            getConstraints: (member) => this.#getViewportConstraints(member),
            getZoomExtent: () => this.zoomExtent,
            ignoreSelectionInitial: this.#ignoreSelectionInitial,
            lastVisible,
        });
    }

    /**
     * Returns true if the domain has been defined explicitly, i.e. not extracted from the data.
     */
    isDomainDefinedExplicitly() {
        return this.#hasConfiguredDomain();
    }

    /** @deprecated Legacy placeholder check, not data readiness or axis usability. */
    isDomainInitialized() {
        const scale = this.#scaleManager.scale;
        if (!scale) return false;
        const domain = scale.domain();
        return isContinuous(scale.type)
            ? domain.length > 2 ||
                  (domain.length === 2 && domain.some((value) => value !== 0))
            : domain.length > 0;
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
            !this.#hasViewportDomain() ||
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
     * @returns {import("../spec/scale.js").Scale}
     */
    #getScaleProps() {
        const props = this.#getMergedScaleProps();
        if (props === null || props.type == "null") {
            // No scale (pass-thru)
            // TODO: Check that the channel is compatible
            return { type: "null" };
        }

        this.#resolvingScaleProps += 1;
        let domain;
        try {
            domain = this.#getConfiguredOrDefaultDomain(
                props.type === LOCUS ? props.assembly : undefined
            );
        } finally {
            this.#resolvingScaleProps -= 1;
        }

        return this.#scaleManager.domainProps(
            props,
            domain,
            this.#hasConfiguredDomain()
        );
    }

    /**
     * Reconfigures the scale: updates domain and other settings.
     *
     * Use this when the set of participating members changes (views added or removed),
     * or when scale properties are otherwise re-resolved from the view hierarchy.
     */
    reconfigure() {
        this.#invalidateMergedScaleProps();
        this.bindDomainInputs();
        this.#updateDomainSource("membership", true);
    }

    /**
     * @param {import("./domainLifecycle.js").DomainSourceUpdate["type"]} [reason]
     */
    reconfigureDomain(reason = "data") {
        this.#updateDomainSource(reason, false);
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
        const props = this.#getMergedScaleProps();
        if (full) this.#scaleManager.configureProperties(props);
        this.#domainInputs.request(reason);
        this.#domainRuntime.runtime.flushNow({ afterTransaction: true });
        if (full && this.#scaleManager.scale === scale && scale.props === props)
            this.#scaleManager.configureRange(props);
    }

    /**
     * @param {import("./domainLifecycle.js").DomainUpdate} update
     * @param {boolean} [requestRender]
     */
    #commitDomainUpdate(update, requestRender = true) {
        return this.#domainRuntime.update(update, requestRender);
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
        const previousRuntime = this.#domainRuntime;
        try {
            const scale = this.#scaleManager.createScale(props, (domain) => {
                if (!this.#domainState) {
                    this.#domainRuntime = new DomainRuntime({
                        runtime: this.#resolutionView.paramRuntime,
                        manager: this.#scaleManager,
                        animator: this.#viewContext.animator,
                        domain,
                        resetDomain: this.#scaleManager.normalizeDomain(
                            this.#getConfiguredOrDefaultDomain()
                        ),
                        renderImmediately: () =>
                            this.#viewContext.renderImmediately(),
                        notifyDomain: () => this.#notifyListeners("domain"),
                        publishZoom: () => {
                            for (const listener of this.#zoomExtentListeners)
                                listener();
                        },
                    });
                    this.#domainRuntime.syncSelection = () =>
                        this.syncLinkedSelectionFromDomain();
                } else {
                    this.#scaleManager.mirrorDomain(
                        this.#domainState.visibleDomain
                    );
                }
            });
            this.bindDomainInputs();
            return scale;
        } catch (error) {
            this.#domainInputs?.dispose();
            this.#domainInputs = undefined;
            this.#scaleManager.resetScale();
            if (this.#domainRuntime !== previousRuntime) {
                this.#domainRuntime?.dispose();
            }
            this.#domainRuntime = previousRuntime;
            throw error;
        }
    }

    /** Internal stable dependency; independent of final range/mapping. */
    getDomainRef() {
        this.getDomain();
        return this.#domainRuntime.domain;
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
        if (this.#domainInputs) return this.#domainInputs.readData();
        const members = this.#getActiveMembers(this.#dataDomainMembers);
        const accessors = (/** @type {ScaleResolutionMember} */ member) =>
            getScaleMemberAccessors(member).filter(
                (accessor) => !accessor.channelDef.domainInert
            );
        return this.#hasViewportDomain()
            ? resolveVisibleDataDomain(
                  members,
                  () => this.type,
                  accessors,
                  (member) => this.#getViewportConstraints(member)
              )
            : resolveDataDomain(members, () => this.type, accessors);
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
