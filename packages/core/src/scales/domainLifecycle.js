import { clampViewport } from "./scaleBand.js";
import { shallowArrayEquals } from "../utils/arrayUtils.js";

/**
 * Lifecycle policy for the scale resolution's commit path. Inputs are internal
 * domains or categorical rank intervals. This module never reads collectors,
 * mutates scales, or schedules callbacks.
 *
 * @typedef {readonly (number | string | boolean)[]} Domain
 * @typedef {{ domain: Domain, gapDomain?: readonly number[] } | { viewport: import("./scaleBand.js").CategoricalViewport | null }} NavigationTarget
 * @typedef {{ id: number, target: NavigationTarget }} DomainTransition
 * @typedef {{
 *   visibleDomain: Domain,
 *   viewport?: import("./scaleBand.js").CategoricalViewport | null,
 *   gapDomain?: readonly number[],
 *   resetDomain: Domain,
 *   initialReference: Domain | undefined,
 *   dataExtent: Domain | undefined,
 *   phase: "collecting" | "interacted" | "ready",
 *   transition: DomainTransition | undefined,
 *   transitionSerial: number,
 * }} DomainState
 *
 * `interacted` still awaits initial readiness but stops partial data from
 * replacing the display. Once ready, ordinary zoomable domains are preserved
 * regardless of whether there was any interaction. Reference collection is
 * independent of that display protection and ends only at readiness.
 *
 * @typedef {{
 *   zoomable: boolean,
 *   scaleKind: "continuous" | "index" | "discrete",
 *   rendered: boolean,
 *   animateChanges: boolean,
 *   selectionLinked: boolean,
 * }} DomainPolicy
 *
 * Source snapshots contain current resolved values, not patches. In particular,
 * a cleared selection remains authoritative and supplies its fallback candidate.
 * `undefined` candidate means no proposed display, not an empty domain.
 * Readiness covers initial contributions, including side inputs. Viewport
 * coverage is checked before submitting a candidate. Membership must not reopen a completed initial phase.
 *
 * @typedef {{
 *   type: "data" | "expression" | "configuration" | "selection" | "selection-sync" | "viewport" | "membership",
 *   candidate: Domain | undefined,
 *   resetDomain: Domain,
 *   referenceDomain: Domain | undefined,
 *   dataExtent: Domain | undefined,
 *   readiness: "pending" | "ready",
 * }} DomainSourceUpdate
 * @typedef {DomainSourceUpdate | {
 *   type: "set",
 *   domain: Domain,
 * } | {
 *   type: "navigate",
 *   target: NavigationTarget,
 *   duration: number,
 * } | {
 *   type: "frame",
 *   id: number,
 *   target: NavigationTarget,
 * } | {
 *   type: "finish",
 *   id: number,
 * }} DomainUpdate
 * @typedef {{ type: "none" } | { type: "cancel" } | {
 *   type: "start",
 *   id: number,
 *   from: Domain,
 *   to: Domain,
 *   target: NavigationTarget,
 *   duration: number,
 * }} TransitionAction
 * @typedef {{
 *   state: DomainState,
 *   domainChanged: boolean,
 *   syncSelection: boolean,
 *   transition: TransitionAction,
 * }} DomainUpdatePlan
 */

/**
 * Startup display and reset target are explicit, even when empty or [0, 0].
 * Arrays supplied to the model are immutable snapshots owned by the caller.
 *
 * @param {Domain} visibleDomain
 * @param {Domain} resetDomain
 * @returns {DomainState}
 */
export function createDomainState(visibleDomain, resetDomain) {
    return {
        visibleDomain,
        resetDomain,
        initialReference: undefined,
        dataExtent: undefined,
        phase: "collecting",
        transition: undefined,
        transitionSerial: 0,
    };
}

/**
 * Decide before changing any live state. A commit installs `state`, mirrors a
 * changed visible domain, synchronizes a linked selection, and notifies domain
 * dependents before rendering. Readiness/reference-only changes do not emit a
 * domain event. Animation targets are never exposed as displayed domains.
 *
 * @param {DomainState} state
 * @param {DomainUpdate} update
 * @param {DomainPolicy} policy
 * @returns {DomainUpdatePlan}
 */
export function planDomainUpdate(state, update, policy) {
    switch (update.type) {
        case "set":
            return applyTarget(state, { domain: update.domain }, 0, policy);
        case "frame":
        case "finish": {
            if (state.transition?.id !== update.id) {
                return unchanged(state);
            }
            return commitTarget(
                update.type === "finish"
                    ? { ...state, transition: undefined }
                    : state,
                update.type === "finish"
                    ? state.transition.target
                    : update.target,
                policy
            );
        }
        case "navigate": {
            const viewport = "viewport" in update.target;
            if (policy.scaleKind === "discrete" && !viewport) {
                throw new Error(
                    "Discrete domains do not support navigation or reset."
                );
            }
            const next =
                state.phase === "collecting" && !viewport
                    ? { ...state, phase: /** @type {const} */ ("interacted") }
                    : state;
            return applyTarget(next, update.target, update.duration, policy);
        }
        case "data":
        case "configuration":
        case "expression":
        case "selection":
        case "selection-sync":
        case "viewport":
        case "membership":
            return planSourceUpdate(state, update, policy);
        default:
            throw new Error(
                "Unknown domain update: " +
                    /** @type {DomainUpdate} */ (update).type
            );
    }
}

/**
 * @param {DomainState} state
 * @param {DomainSourceUpdate} update
 * @param {DomainPolicy} policy
 * @returns {DomainUpdatePlan}
 */
function planSourceUpdate(state, update, policy) {
    const next = {
        ...state,
        resetDomain: update.resetDomain,
        dataExtent: update.dataExtent,
        initialReference:
            state.phase === "ready"
                ? state.initialReference
                : (update.referenceDomain ?? state.initialReference),
        phase:
            update.readiness === "ready"
                ? /** @type {const} */ ("ready")
                : state.phase,
    };

    if (update.candidate === undefined) {
        return unchanged(next);
    }

    // Explicit domain/selection updates have authority; animation preference
    // must not grant that authority to an ordinary late data or member update.
    const fromSelection =
        update.type === "selection" || update.type === "selection-sync";
    if (
        update.type === "selection-sync" &&
        shallowArrayEquals(update.candidate, state.visibleDomain)
    )
        return unchanged(next);
    const authoritative =
        policy.selectionLinked ||
        fromSelection ||
        update.type === "configuration" ||
        (update.type === "expression" && !policy.animateChanges);
    if (!authoritative && state.phase !== "collecting" && policy.zoomable) {
        return unchanged(next);
    }

    // Passive refreshes and owner echoes must not interrupt a linked zoom.
    // An external clear can have this same domain before the first frame and
    // must still cancel it: equality alone does not establish update authority.
    const passiveSelectionUpdate =
        update.type === "selection-sync" ||
        update.type === "data" ||
        update.type === "membership";
    if (
        policy.selectionLinked &&
        passiveSelectionUpdate &&
        state.transition &&
        shallowArrayEquals(update.candidate, state.visibleDomain)
    ) {
        return unchanged(next);
    }

    // An unchanged membership publication must not cancel viewport animation.
    if (
        state.transition &&
        "viewport" in state.transition.target &&
        shallowArrayEquals(update.candidate, state.visibleDomain)
    )
        return unchanged(next);

    const animate =
        state.phase === "ready" &&
        policy.scaleKind === "continuous" &&
        policy.rendered &&
        policy.animateChanges &&
        !policy.selectionLinked &&
        !fromSelection;
    // Refreshing an animation target is redundant, but an immediate authoritative
    // update must still cancel an animation even when it has that same target.
    if (
        animate &&
        state.transition &&
        "domain" in state.transition.target &&
        shallowArrayEquals(update.candidate, state.transition.target.domain)
    ) {
        return unchanged(next);
    }
    return applyTarget(
        next,
        { domain: update.candidate },
        animate ? 500 : 0,
        policy
    );
}

/**
 * @param {DomainState} state
 * @param {NavigationTarget} target
 * @param {number} duration
 * @param {DomainPolicy} policy
 * @returns {DomainUpdatePlan}
 */
function applyTarget(state, target, duration, policy) {
    const viewport = "viewport" in target;
    const domain = viewport
        ? (target.viewport?.interval ?? [0, state.visibleDomain.length])
        : target.domain;
    const gapDomain = viewport ? target.viewport?.gapRanks : target.gapDomain;
    const from = viewport
        ? (state.viewport?.interval ?? [0, state.visibleDomain.length])
        : state.visibleDomain;
    if (
        duration > 0 &&
        (viewport || policy.scaleKind !== "discrete") &&
        from.length === 2 &&
        domain.length === 2 &&
        // Exponential span interpolation requires nonzero spans of the same sign.
        // Empty startup domains acquire their first effective extent immediately.
        Number.isFinite(+domain[1] - +domain[0]) &&
        Number.isFinite(+from[1] - +from[0]) &&
        (+domain[1] - +domain[0]) * (+from[1] - +from[0]) > 0 &&
        (!shallowArrayEquals(domain, from) ||
            !shallowArrayEquals(
                gapDomain ?? [],
                (viewport ? state.viewport?.gapRanks : state.gapDomain) ?? []
            ))
    ) {
        const id = state.transitionSerial + 1;
        return {
            state: {
                ...state,
                transition: { id, target },
                transitionSerial: id,
            },
            domainChanged: false,
            syncSelection: false,
            transition: {
                type: "start",
                id,
                from,
                to: domain,
                target,
                duration,
            },
        };
    }

    return {
        ...commitTarget({ ...state, transition: undefined }, target, policy),
        transition: state.transition ? { type: "cancel" } : { type: "none" },
    };
}

/**
 * @param {DomainState} state
 * @param {NavigationTarget} target
 * @param {DomainPolicy} policy
 * @returns {DomainUpdatePlan}
 */
function commitTarget(state, target, policy) {
    if ("viewport" in target) {
        return unchanged({ ...state, viewport: target.viewport });
    }
    const { domain, gapDomain } = target;
    const domainChanged =
        !shallowArrayEquals(domain, state.visibleDomain) ||
        !shallowArrayEquals(gapDomain ?? [], state.gapDomain ?? []);
    return {
        state: domainChanged
            ? {
                  ...state,
                  visibleDomain: domain,
                  gapDomain,
                  viewport:
                      state.phase === "ready"
                          ? clampViewport(
                                state.viewport
                                    ? { interval: state.viewport.interval }
                                    : state.viewport,
                                domain.length
                            )
                          : state.viewport,
              }
            : state,
        domainChanged,
        // A configured initial domain may already match the startup display
        // while its linked selection still needs seeding. The adapter compares
        // normalized intervals before publishing a parameter change.
        syncSelection: policy.selectionLinked && policy.zoomable,
        transition: { type: "none" },
    };
}

/**
 * @param {DomainState} state
 * @returns {DomainUpdatePlan}
 */
function unchanged(state) {
    return {
        state,
        domainChanged: false,
        syncSelection: false,
        transition: { type: "none" },
    };
}
