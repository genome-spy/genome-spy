import { shallowArrayEquals } from "../utils/arrayUtils.js";

/**
 * Provisional lifecycle policy for the domain-owner extraction. Live scale
 * integration follows separately. Inputs are normalized internal domains;
 * this module never reads collectors, mutates scales, or schedules callbacks.
 *
 * @typedef {readonly (number | string | boolean)[]} Domain
 * @typedef {{ id: number, target: Domain }} DomainTransition
 * @typedef {{
 *   visibleDomain: Domain,
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
 * Readiness includes relevant side inputs; viewport readiness includes current
 * interval coverage. Membership must not reopen a completed initial phase.
 *
 * @typedef {{
 *   type: "data" | "configuration" | "selection" | "selection-sync" | "viewport" | "membership",
 *   candidate: Domain | undefined,
 *   resetDomain: Domain,
 *   referenceDomain: Domain | undefined,
 *   dataExtent: Domain | undefined,
 *   readiness: "pending" | "ready",
 * }} DomainSourceUpdate
 * @typedef {DomainSourceUpdate | {
 *   type: "navigate",
 *   domain: Domain,
 *   duration: number,
 * } | {
 *   type: "reset",
 * } | {
 *   type: "frame",
 *   id: number,
 *   domain: Domain,
 * } | {
 *   type: "finish",
 *   id: number,
 * }} DomainUpdate
 * @typedef {{ type: "none" } | { type: "cancel" } | {
 *   type: "start",
 *   id: number,
 *   from: Domain,
 *   to: Domain,
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
        case "frame":
        case "finish": {
            if (state.transition?.id !== update.id) {
                return unchanged(state);
            }
            const domain =
                update.type === "finish"
                    ? state.transition.target
                    : update.domain;
            return commitDomain(
                update.type === "finish"
                    ? { ...state, transition: undefined }
                    : state,
                domain,
                policy
            );
        }
        case "navigate":
        case "reset": {
            if (policy.scaleKind === "discrete") {
                throw new Error(
                    "Discrete domains do not support navigation or reset."
                );
            }
            const next =
                state.phase === "collecting"
                    ? { ...state, phase: /** @type {const} */ ("interacted") }
                    : state;
            return applyDomain(
                next,
                update.type === "reset" ? state.resetDomain : update.domain,
                update.type === "reset" ? 0 : update.duration,
                policy
            );
        }
        case "data":
        case "configuration":
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

    if (
        update.candidate === undefined ||
        (update.type === "viewport" && update.readiness === "pending")
    ) {
        return unchanged(next);
    }

    // Explicit domain/selection updates have authority; animation preference
    // must not grant that authority to an ordinary late data or member update.
    const fromSelection =
        update.type === "selection" || update.type === "selection-sync";
    const authoritative =
        policy.selectionLinked ||
        fromSelection ||
        update.type === "configuration";
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
        shallowArrayEquals(update.candidate, state.transition.target)
    ) {
        return unchanged(next);
    }
    return applyDomain(next, update.candidate, animate ? 500 : 0, policy);
}

/**
 * @param {DomainState} state
 * @param {Domain} domain
 * @param {number} duration
 * @param {DomainPolicy} policy
 * @returns {DomainUpdatePlan}
 */
function applyDomain(state, domain, duration, policy) {
    if (
        duration > 0 &&
        policy.scaleKind !== "discrete" &&
        !shallowArrayEquals(domain, state.visibleDomain)
    ) {
        const id = state.transitionSerial + 1;
        return {
            state: {
                ...state,
                transition: { id, target: domain },
                transitionSerial: id,
            },
            domainChanged: false,
            syncSelection: false,
            transition: {
                type: "start",
                id,
                from: state.visibleDomain,
                to: domain,
                duration,
            },
        };
    }

    return {
        ...commitDomain({ ...state, transition: undefined }, domain, policy),
        transition: state.transition ? { type: "cancel" } : { type: "none" },
    };
}

/**
 * @param {DomainState} state
 * @param {Domain} domain
 * @param {DomainPolicy} policy
 * @returns {DomainUpdatePlan}
 */
function commitDomain(state, domain, policy) {
    const domainChanged = !shallowArrayEquals(domain, state.visibleDomain);
    return {
        state: domainChanged ? { ...state, visibleDomain: domain } : state,
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
