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
import { isDataReady } from "../data/dataReadiness.js";
import deepEqual from "../utils/deepEqual.js";
import { DOMAIN_UPDATE_PRIORITY } from "./domainRuntime.js";

/**
 * Compile replaceable inputs for a continuous domain. Membership, declaration
 * scope, accessors and viewport topology are resolved here, not during updates.
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
 * @param {boolean} options.ignoreSelectionInitial
 */
export default function createDomainInputs({
    owner,
    manager,
    props,
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
                // Encoders are installed after scale bootstrap. Collector registration
                // replaces these bindings once actual encoders/constraints are available.
                const bound =
                    viewport && member.view.mark.encoders
                        ? getConstraints(member)
                        : [];
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
            const data = readData();
            fallback = defaultDomain(data);
            const domain = configured.get() ?? fallback;
            const finalProps = { ...props };
            if (domain?.length) finalProps.domain = domain;
            if (!finalProps.domain && finalProps.domainMid !== undefined) {
                finalProps.domain = [
                    finalProps.domainMin ?? 0,
                    finalProps.domainMax ?? 1,
                ];
            }
            const normalized = manager.prepareDomain(finalProps);
            const candidate =
                reason === "viewport" &&
                !isViewportDataReady(dataMembers, (member) =>
                    constraints.get(member)
                )
                    ? undefined
                    : (normalized.domain ?? undefined);
            void owner.update({
                type: reason,
                candidate,
                resetDomain: manager.normalizeDomain(
                    configured.get() ?? defaultDomain(undefined)
                ),
                referenceDomain: link ? fallback : candidate,
                dataExtent:
                    typeof props.zoom === "object" &&
                    props.zoom.extent === "data"
                        ? data && Array.from(data)
                        : undefined,
                readiness:
                    owner.state.phase === "ready" || ready()
                        ? "ready"
                        : "pending",
            });
        };
        /** @param {import("./domainLifecycle.js").DomainSourceUpdate["type"]} reason */
        const request = (reason) => {
            // Authored/selection changes retain authority when data invalidates in
            // the same turn. Source publication reads all settled inputs once.
            if (
                !pendingReason ||
                reason === "selection" ||
                (pendingReason !== "selection" &&
                    reason !== "selection-sync" &&
                    (reason !== "data" || pendingReason === "selection-sync"))
            )
                pendingReason = reason;
            runtime.requestUpdate(publish, DOMAIN_UPDATE_PRIORITY - 1, () => {
                pendingReason = undefined;
            });
        };
        const scheduler = new ViewportDomainScheduler({
            hasViewportDomain: () => viewport,
            getDependencies: () => viewportDependencies,
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
                    const own = outgoing !== undefined && value === outgoing;
                    selection.set({
                        value,
                        own,
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

        return {
            get lastVisible() {
                return lastVisible;
            },
            get ignoreSelectionInitial() {
                return selection.get().ignoreInitial;
            },
            request,
            dataChanged() {
                if (viewport && owner.state.phase === "ready")
                    scheduler.schedule(true);
                else request("data");
                runtime.flushNow({ afterTransaction: true });
            },
            syncSelection() {
                if (!link || !props.zoom) return;
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
