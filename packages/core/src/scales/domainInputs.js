import { isContinuous, isDiscrete } from "vega-scale";
import { LOCUS } from "./scaleResolutionConstants.js";
import { toInternalIndexLikeDataDomain } from "./indexLikeDomainUtils.js";
import {
    resolveConfiguredDomain,
    resolveDataDomain,
    resolveDefaultDomain,
} from "./domainPlanner.js";
import { collectConfiguredDomainExprRefs } from "./domainExpressions.js";
import {
    resolveVisibleDataDomain,
    isViewportDataReady,
    isViewportDomainRef,
    ViewportDomainScheduler,
} from "./viewportDomain.js";
import { getScaleMemberAccessors } from "./domainPlanner.js";
import {
    getIntervalSelection,
    normalizeIntervalForSelection,
} from "./selectionDomainUtils.js";
import { getAccessorDomainKey } from "../encoder/accessor.js";
import { getPrimaryChannel } from "../encoder/encoder.js";
import { collectDomainSensitiveScaleChannels } from "../data/flowNode.js";
import { isDataReady } from "../data/dataReadiness.js";
import deepEqual from "../utils/deepEqual.js";
import { DOMAIN_UPDATE_PRIORITY } from "./domainRuntime.js";

/**
 * Compile replaceable domain inputs for a shared scale. Membership, declaration
 * scope, accessors and viewport topology are resolved here, not during updates.
 *
 * This binding joins graph-based expressions/selections with collector and
 * viewport invalidations. request() coalesces them into a source snapshot for
 * DomainRuntime, which decides whether to preserve, replace, or animate the
 * displayed domain. This module derives inputs; it does not own that lifecycle.
 *
 * The returned binding owns its subscriptions, computed refs and viewport timer.
 * Replace it when configuration or participants change, retaining the owner.
 * lastVisible and ignoreSelectionInitial carry input history across replacement:
 * an empty viewport retains its last domain, and a cleared brush stays cleared.
 * syncSelection() is the reverse path from the owner's display to a linked brush.
 *
 * @param {object} options
 * @param {import("./domainRuntime.js").default} options.owner
 * @param {import("./scaleInstanceManager.js").default} options.manager
 * @param {import("../spec/scale.js").Scale} options.props
 * @param {import("../spec/channel.js").Type} options.type
 * @param {Set<import("./scaleResolution.js").ScaleResolutionMember>} options.members
 * @param {Set<import("./scaleResolution.js").ScaleResolutionMember>} options.dataMembers
 * @param {import("./domainPlanner.js").ConfiguredDomainSource | undefined} options.viewLevelDomain
 * @param {(expr: string) => import("../paramRuntime/types.js").ExprRefFunction} options.createExpression
 * @param {import("./domainPlanner.js").SelectionBindingResolver} options.resolveSelectionBinding
 * @param {import("./domainPlanner.js").FromComplexInterval} options.fromComplexInterval
 * @param {import("./domainPlanner.js").GetLocusExtent} options.getLocusExtent
 * @param {import("./domainPlanner.js").SelectionDomainLinkInfo | undefined} options.link
 * @param {boolean} options.viewport
 * @param {Set<import("./scaleResolution.js").default>} options.viewportDependencies
 * @param {import("./domainPlanner.js").ViewportConstraintsGetter} options.getConstraints
 * @param {() => number[]} options.getZoomExtent
 * @param {import("../utils/domainArray.js").DomainArray | undefined} options.lastVisible
 * @param {boolean} options.explicit
 * @param {boolean} options.ignoreSelectionInitial
 */
export default function createDomainInputs({
    owner,
    manager,
    props,
    explicit,
    type,
    members,
    dataMembers,
    viewLevelDomain,
    createExpression,
    resolveSelectionBinding,
    fromComplexInterval,
    getLocusExtent,
    link,
    viewport,
    viewportDependencies,
    getConstraints,
    getZoomExtent,
    ignoreSelectionInitial,
    lastVisible,
}) {
    const runtime = owner.runtime;
    const views = Array.from(members, (member) => member.view);

    owner.policy = () => ({
        zoomable:
            isContinuous(props.type) && !isDiscrete(props.type) && !!props.zoom,
        scaleKind:
            props.type === "index"
                ? "index"
                : isContinuous(props.type) && !isDiscrete(props.type)
                  ? "continuous"
                  : "discrete",
        rendered: views.some((view) => view.hasRendered()),
        animateChanges: props.domainTransition !== false,
        selectionLinked: !!link,
    });

    /** @type {(() => void)[]} */
    const disposers = [];

    try {
        /** @type {Map<string, import("../paramRuntime/types.js").ExprRefFunction>} */
        const expressions = new Map();
        for (const domain of [
            viewLevelDomain?.domain,
            ...Array.from(members, (member) =>
                member.contributesToDomain
                    ? member.channelDef.scale?.domain
                    : undefined
            ),
        ]) {
            for (const ref of collectConfiguredDomainExprRefs(domain)) {
                if (!expressions.has(ref.expr))
                    expressions.set(ref.expr, createExpression(ref.expr));
            }
        }

        const accessors = new Map(
            Array.from(dataMembers, (member) => [
                member,
                getScaleMemberAccessors(member).filter(
                    (a) => !a.channelDef.domainInert
                ),
            ])
        );

        const constraints = new Map(
            Array.from(dataMembers, (member) => {
                // Encoders are installed after scale bootstrap. Subtree initialization
                // replaces these bindings once all encoders are available.
                const bound =
                    viewport && member.view.mark.encoders
                        ? getConstraints(member)
                        : [];

                // Resolve dependency identities once, but read their current
                // displayed intervals when querying rows, including during zoom.
                const dynamic = bound.map((constraint) => {
                    const resolution = member.view.getScaleResolution(
                        constraint.channel
                    );
                    return {
                        ...constraint,
                        get domain() {
                            const domain = resolution.getDomain();
                            return /** @type {[number, number]} */ ([
                                domain[0],
                                domain.at(-1),
                            ]);
                        },
                    };
                });
                return [member, dynamic];
            })
        );

        const selection = runtime.signal("selection domain input", {
            value: link
                ? getIntervalSelection(
                      link.runtime.getValue(link.param),
                      link.param
                  )
                : undefined,
            own: false,
            ignoreInitial: ignoreSelectionInitial,
        });
        disposers.push(selection.dispose);

        /** @type {unknown} */
        let outgoing;

        /** @type {import("./domainLifecycle.js").DomainSourceUpdate["type"] | undefined} */
        let pendingReason;

        /** @type {any[]} */
        let fallback = [];
        let disposed = false;

        const configured = runtime.computed(
            "configured domain",
            [
                selection,
                ...Array.from(expressions.values()).flatMap(
                    (expr) => expr.dependencies
                ),
            ],
            () =>
                resolveConfiguredDomain(
                    members,
                    viewLevelDomain,
                    (expr) => expressions.get(expr),
                    link
                        ? () => ({
                              runtime: link.runtime,
                              selection: selection.get().value,
                          })
                        : resolveSelectionBinding,
                    fromComplexInterval,
                    !selection.get().ignoreInitial
                ).domain,
            { equals: (a, b) => deepEqual(a, b) }
        );
        disposers.push(configured.dispose);

        const readData = () => {
            if (viewport) {
                const visible = resolveVisibleDataDomain(
                    dataMembers,
                    () => type,
                    (member) => accessors.get(member),
                    (member) => constraints.get(member)
                );
                if (visible?.length) lastVisible = visible;
                return visible?.length ? visible : lastVisible;
            }
            return resolveDataDomain(
                dataMembers,
                () => type,
                (member) => accessors.get(member)
            );
        };

        // Initial readiness is independent of domain contents and viewport
        // coverage. An uninitialized member can contribute an authored domain;
        // installed constant-only accessors need no collector publication.
        // Otherwise require meaningful data completion, even when empty.
        const ready = () =>
            Array.from(dataMembers).every((member) => {
                if (!member.view.isDataInitialized()) {
                    const domain = member.channelDef.scale?.domain;
                    return domain !== undefined && !isViewportDomainRef(domain);
                }
                if (!member.view.mark.encoders?.[member.channel]) return false;
                if (accessors.get(member).every((a) => a.constant)) return true;
                const collector = member.view.getCollector();
                return !!collector && isDataReady(collector);
            });

        /** @param {import("../utils/domainArray.js").DomainArray | undefined} data */
        const defaultDomain = (data) =>
            resolveDefaultDomain(type, getLocusExtent, data, props.assembly);

        const publish = () => {
            const reason = pendingReason;
            pendingReason = undefined;
            if (disposed || !reason) return;

            if (reason === "selection-sync") {
                // The owner already committed this display. Its brush echo must
                // not rescan data or advance readiness; real data invalidation
                // takes precedence over an echo in request().
                void owner.update({
                    type: reason,
                    candidate: owner.state.visibleDomain,
                    resetDomain: manager.normalizeDomain(
                        configured.get() ?? defaultDomain(undefined)
                    ),
                    referenceDomain: owner.state.initialReference,
                    dataExtent: owner.state.dataExtent,
                    readiness:
                        owner.state.phase === "ready" ? "ready" : "pending",
                });
                return;
            }

            const configuredDomain = configured.get();

            // Authored domains need rows only for linked fallback or loaded extent;
            // genomic fallback comes from the assembly rather than loaded rows.
            const needsData =
                (type !== LOCUS && (!configuredDomain || !!link)) ||
                (typeof props.zoom === "object" &&
                    props.zoom.extent === "data");
            const data = needsData ? readData() : undefined;
            fallback = defaultDomain(data);

            const domain = configuredDomain ?? fallback;
            const finalProps = manager.domainProps(props, domain, explicit);
            const normalized = manager.prepareDomain(finalProps);

            if (normalized.applyOrdinalUnknown)
                /** @type {import("d3-scale").ScaleOrdinal<any, any>} */ (
                    manager.scale
                ).unknown(normalized.ordinalUnknown);
            if (isDiscrete(props.type)) {
                /** @type {any} */ (manager.scale.props).domainIndexer =
                    /** @type {any} */ (finalProps).domainIndexer;
            }

            const candidate =
                reason === "viewport" &&
                !isViewportDataReady(dataMembers, (member) =>
                    constraints.get(member)
                )
                    ? undefined
                    : (normalized.domain ?? undefined);

            // These domains serve different purposes: candidate proposes a
            // display, reset excludes a data-derived fallback, and reference
            // collects the initial navigation baseline. A linked brush uses the
            // fallback as its reference rather than its selected subinterval.
            void owner.update({
                type: reason,
                candidate,
                resetDomain: manager.normalizeDomain(
                    configuredDomain ?? defaultDomain(undefined)
                ),
                referenceDomain: link ? fallback : candidate,
                dataExtent:
                    typeof props.zoom === "object" &&
                    props.zoom.extent === "data"
                        ? data?.length
                            ? Array.from(
                                  toInternalIndexLikeDataDomain(type, data)
                              )
                            : undefined
                        : undefined,
                readiness:
                    owner.state.phase === "ready" || ready()
                        ? "ready"
                        : "pending",
            });
        };

        /** @param {import("./domainLifecycle.js").DomainSourceUpdate["type"]} reason */
        const request = (reason) => {
            // Preserve the strongest update reason while reading all current
            // values once: external selection wins, data cannot replace a more
            // specific reason, and owner echoes cannot replace real changes.
            // Other specific reasons use the latest request in this batch.
            if (
                !pendingReason ||
                reason === "selection" ||
                (pendingReason !== "selection" &&
                    reason !== "selection-sync" &&
                    (reason !== "data" || pendingReason === "selection-sync"))
            )
                pendingReason = reason;

            // Derive inputs after queued upstream replay, before domain commits.
            runtime.requestUpdate(publish, DOMAIN_UPDATE_PRIORITY - 1, () => {
                pendingReason = undefined;
            });
        };

        // Navigation/data bursts debounce viewport queries only after initial
        // readiness. Bootstrap must publish promptly to initialize dependent
        // scales and lazy requests; coverage still gates viewport candidates.
        const scheduler = new ViewportDomainScheduler({
            isReady: () =>
                isViewportDataReady(dataMembers, (member) =>
                    constraints.get(member)
                ),
            update: () => {
                request("viewport");
                runtime.flushNow({ afterTransaction: true });
            },
        });

        for (const resolution of viewportDependencies) {
            disposers.push(
                resolution.getDomainRef().subscribe(() => {
                    if (owner.state.phase === "ready")
                        scheduler.schedule(false);
                    else request("viewport");
                })
            );
        }
        disposers.push(() => scheduler.clear());

        disposers.push(
            configured.subscribe(() =>
                request(
                    link
                        ? selection.get().own
                            ? "selection-sync"
                            : "selection"
                        : "expression"
                )
            )
        );

        if (link) {
            disposers.push(
                link.runtime.subscribe(link.param, () => {
                    const previous = selection.get();
                    const value = getIntervalSelection(
                        link.runtime.getValue(link.param),
                        link.param
                    );
                    const interval = value?.intervals[link.encoding];

                    // Capture origin while setValue() is notifying listeners.
                    // Deferred publication cannot use the stack-scoped outgoing
                    // marker; equal-valued external writes are still commands.
                    const own = outgoing !== undefined && value === outgoing;
                    selection.set({
                        value,
                        own,
                        // After a populated brush is cleared, do not resurrect
                        // the authored initial interval on the next evaluation.
                        ignoreInitial: interval
                            ? false
                            : previous.value?.intervals[link.encoding]
                              ? true
                              : previous.ignoreInitial,
                    });

                    // Even a clear with an unchanged normalized domain is a command.
                    request(own ? "selection-sync" : "selection");
                })
            );
        }

        const dataChanged = () => {
            if (viewport && owner.state.phase === "ready")
                scheduler.schedule(true);
            else request("data");
            runtime.flushNow({ afterTransaction: true });
        };

        // The same bound accessors drive domain extraction and invalidation.
        // A domain-sensitive flow must not invalidate its own inferred domain.
        /** @type {Map<import("../data/collector.js").default, {keys: Set<string>, sensitive: Set<import("../spec/channel.js").ChannelWithScale>}>} */
        const subscriptions = new Map();
        for (const member of dataMembers) {
            const collector = member.view.getCollector();
            if (!collector) continue;

            let subscription = subscriptions.get(collector);
            if (!subscription) {
                subscription = {
                    keys: new Set(),
                    sensitive: collectDomainSensitiveScaleChannels(collector),
                };
                subscriptions.set(collector, subscription);
            }

            for (const accessor of accessors.get(member)) {
                if (
                    !explicit &&
                    subscription.sensitive.has(
                        /** @type {import("../spec/channel.js").ChannelWithScale} */ (
                            getPrimaryChannel(accessor.scaleChannel)
                        )
                    )
                )
                    continue;
                subscription.keys.add(getAccessorDomainKey(accessor, type));
            }
        }

        for (const [collector, { keys }] of subscriptions) {
            for (const key of keys)
                disposers.push(
                    collector.subscribeDomainChanges(key, dataChanged)
                );
        }

        return {
            get lastVisible() {
                return lastVisible;
            },

            get ignoreSelectionInitial() {
                return selection.get().ignoreInitial;
            },

            request,
            readData,

            syncSelection() {
                if (
                    !link ||
                    !props.zoom ||
                    !isContinuous(props.type) ||
                    isDiscrete(props.type)
                )
                    return;

                const current = getIntervalSelection(
                    link.runtime.getValue(link.param),
                    link.param
                );
                if (!current) return;

                const interval = normalizeIntervalForSelection(
                    /** @type {number[]} */ (owner.state.visibleDomain),
                    getZoomExtent()
                );
                if (!interval) return;

                const fallbackInterval = normalizeIntervalForSelection(
                    fallback,
                    getZoomExtent()
                );
                // The fallback is represented by an empty brush, so resetting
                // navigation does not leave a redundant full-domain selection.
                const synced = deepEqual(interval, fallbackInterval)
                    ? null
                    : interval;
                if (deepEqual(current.intervals[link.encoding] ?? null, synced))
                    return;

                const value = {
                    ...current,
                    intervals: {
                        ...current.intervals,
                        [link.encoding]: synced,
                    },
                };

                outgoing = value;
                try {
                    link.runtime.setValue(link.param, value);
                } finally {
                    outgoing = undefined;
                }
            },

            dispose() {
                disposed = true;
                runtime.cancelUpdate(publish);
                for (const dispose of disposers) dispose();
            },
        };
    } catch (error) {
        for (const dispose of disposers.reverse()) dispose();
        throw error;
    }
}
