import { easeCubicInOut } from "d3-ease";
import eerp from "../utils/eerp.js";
import { createCancelToken } from "../utils/transition.js";
import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import deepEqual from "../utils/deepEqual.js";
import { shallowArrayEquals } from "../utils/arrayUtils.js";
import { createDomainState, planDomainUpdate } from "./domainLifecycle.js";

// Streaming replay roots use their finite tree depth. Domain policy must see
// every pending publication before making historical initialization decisions.
export const DOMAIN_UPDATE_PRIORITY = Number.MAX_SAFE_INTEGER - 1;

/**
 * Stable domain publication and animation resources. Input bindings can be
 * replaced without replacing the displayed-domain ref or navigation history.
 */
export default class DomainRuntime {
    /** @type {import("../paramRuntime/viewParamRuntime.js").default} */
    #runtime;

    /** @type {import("./scaleInstanceManager.js").default} */
    #manager;

    /** @type {import("../utils/animator.js").default} */
    #animator;

    /** @type {import("../paramRuntime/types.js").WritableParamRef<import("./domainLifecycle.js").DomainState> & { dispose: () => void }} */
    #state;

    /** @type {() => import("./domainLifecycle.js").DomainPolicy} */
    policy = () => {
        throw new Error("Domain inputs are not bound.");
    };

    /** @type {{update: import("./domainLifecycle.js").DomainUpdate, render: boolean, resolve: () => void, reject: (error: unknown) => void}[]} */
    #pending = [];

    /** @type {{canceled: boolean} | undefined} */
    #transitionToken;

    #disposed = false;

    #renderRequested = false;

    #immediateRenderRequested = false;

    #initialReady = false;

    /** @type {() => void} */
    #publishZoom;

    /** @type {import("../paramRuntime/types.js").WritableParamRef<number>} */
    #renderRevision;

    /** @type {() => void} */
    syncSelection = () => undefined;

    /**
     * @param {object} options
     * @param {import("../paramRuntime/viewParamRuntime.js").default} options.runtime
     * @param {import("./scaleInstanceManager.js").default} options.manager
     * @param {import("../utils/animator.js").default} options.animator
     * @param {import("./domainLifecycle.js").Domain} options.domain
     * @param {import("./domainLifecycle.js").Domain} options.resetDomain
     * @param {() => void} options.notifyDomain
     * @param {() => void} options.renderImmediately
     * @param {() => void} options.publishZoom
     */
    constructor({
        runtime: parentRuntime,
        manager,
        animator,
        domain,
        resetDomain,
        notifyDomain,
        publishZoom,
        renderImmediately,
    }) {
        // A shared scale can outlive the member view that first created it.
        const runtime = new ViewParamRuntime(() => parentRuntime);
        this.#runtime = runtime;
        this.#manager = manager;
        this.#animator = animator;
        this.#state = runtime.signal(
            "domain state",
            createDomainState(domain, resetDomain)
        );
        this.domain = runtime.computed(
            "displayed domain",
            [this.#state],
            () => this.state.visibleDomain,
            {
                equals: shallowArrayEquals,
            }
        );
        this.#publishZoom = publishZoom;
        runtime.effect([this.domain], notifyDomain);
        this.#renderRevision = runtime.signal("domain render publication", 0);
        runtime.effect([this.domain, this.#renderRevision], () => {
            if (!this.#renderRequested && !this.#immediateRenderRequested)
                return;
            const immediate = this.#immediateRenderRequested;
            this.#immediateRenderRequested = false;
            this.#renderRequested = false;
            if (immediate) renderImmediately();
            else animator.requestRender();
        });
    }

    /** @type {import("../paramRuntime/types.js").ComputedParamRef<import("./domainLifecycle.js").Domain>} */
    domain;

    get runtime() {
        return this.#runtime;
    }

    get state() {
        return this.#state.get();
    }

    /**
     * Commands join the active propagation boundary. Their promises resolve
     * after publication (or after the requested animation completes).
     * @param {import("./domainLifecycle.js").DomainUpdate} update
     * @param {boolean} [render]
     */
    update(update, render = true) {
        if (this.#disposed) {
            return Promise.resolve();
        }
        /** @type {Promise<void>} */
        const result = new Promise((resolve, reject) => {
            this.#pending.push({ update, render, resolve, reject });
        });
        this.#runtime.requestUpdate(
            this.#publish,
            DOMAIN_UPDATE_PRIORITY,
            this.#abandon
        );
        void result.catch(() => {});
        this.#runtime.flushNow({ afterTransaction: true });
        return result;
    }

    /** Discard snapshots from replaced bindings while retaining public commands. */
    cancelSourceUpdates() {
        this.#pending = this.#pending.filter((operation) => {
            if ("candidate" in operation.update) {
                operation.resolve();
                return false;
            }
            return true;
        });
        this.#initialReady = false;
        this.#runtime.cancelUpdate(this.#finalizeInitial);
    }

    #publish = () => {
        if (this.#pending.length) {
            const operation = this.#pending.shift();
            try {
                let update = operation.update;
                if (
                    update.type === "selection-sync" &&
                    !shallowArrayEquals(
                        update.candidate,
                        this.state.visibleDomain
                    )
                ) {
                    operation.resolve();
                    return;
                }
                if ("domain" in update) {
                    update = {
                        ...update,
                        domain: this.#manager.normalizeDomain(update.domain),
                    };
                }
                if ("readiness" in update && this.state.phase !== "ready") {
                    if (update.type !== "selection-sync") {
                        this.#initialReady = update.readiness === "ready";
                        this.#runtime.requestUpdate(
                            this.#finalizeInitial,
                            DOMAIN_UPDATE_PRIORITY + 1,
                            this.#abandon
                        );
                    }
                    update = { ...update, readiness: "pending" };
                }
                const previous = this.state;
                const plan = planDomainUpdate(previous, update, this.policy());
                if (plan.transition.type !== "none") {
                    this.#cancelTransition();
                }
                if (plan.domainChanged) {
                    this.#manager.mirrorDomain(plan.state.visibleDomain);
                    this.#renderRequested ||= operation.render;
                }
                this.#state.set(plan.state);
                if (plan.syncSelection) {
                    // This can enqueue an external replacement. It must settle
                    // in publication work, before terminal notification effects.
                    this.syncSelection();
                    if (this.#disposed) {
                        operation.resolve();
                        return;
                    }
                }
                if (
                    plan.domainChanged ||
                    !deepEqual(
                        previous.initialReference,
                        plan.state.initialReference
                    ) ||
                    !deepEqual(previous.dataExtent, plan.state.dataExtent)
                ) {
                    this.#publishZoom();
                    if (this.#disposed) {
                        operation.resolve();
                        return;
                    }
                }
                if (this.#renderRequested) this.#requestRender();
                if (plan.transition.type === "start") {
                    this.#animate(plan.transition).then(
                        operation.resolve,
                        operation.reject
                    );
                } else {
                    operation.resolve();
                }
            } catch (error) {
                operation.reject(error);
                this.#abandon(error);
                throw error;
            } finally {
                if (this.#pending.length)
                    this.#runtime.requestUpdate(
                        this.#publish,
                        DOMAIN_UPDATE_PRIORITY,
                        this.#abandon
                    );
            }
        }
    };

    /** @param {unknown} error */
    #abandon = (error) => {
        this.#initialReady = false;
        for (const pending of this.#pending.splice(0)) pending.reject(error);
    };

    #finalizeInitial = () => {
        // Freeze history only after every synchronous source/domain job and
        // calibrated expression has settled, before any observer effect runs.
        if (
            !this.#disposed &&
            this.#initialReady &&
            this.state.phase !== "ready"
        ) {
            this.#state.set({ ...this.state, phase: "ready" });
        }
    };

    #requestRender() {
        this.#renderRevision.set(this.#renderRevision.get() + 1);
    }

    renderImmediately() {
        if (this.#disposed) return;
        this.#immediateRenderRequested = true;
        this.#requestRender();
        this.#runtime.flushNow({ afterTransaction: true });
    }

    #cancelTransition() {
        if (this.#transitionToken) {
            this.#transitionToken.canceled = true;
            this.#transitionToken = undefined;
        }
    }

    /** @param {Extract<import("./domainLifecycle.js").TransitionAction, {type: "start"}>} action */
    async #animate(action) {
        const from = /** @type {readonly number[]} */ (action.from);
        const to = /** @type {readonly number[]} */ (action.to);
        const fw = from[1] - from[0];
        const tw = to[1] - to[0];
        const fc = from[0] + fw / 2;
        const tc = to[0] + tw / 2;
        const token = createCancelToken();
        this.#transitionToken = token;
        await this.#animator.transition({
            duration: action.duration,
            easingFunction: easeCubicInOut,
            cancelToken: token,
            onUpdate: (t) => {
                if (token.canceled) return;
                const w = eerp(fw, tw, t);
                const wt = fw === tw ? t : (fw - w) / (fw - tw);
                const c = wt * tc + (1 - wt) * fc;
                void this.update({
                    type: "frame",
                    id: action.id,
                    domain: [
                        from[0] === to[0] ? from[0] : c - w / 2,
                        from[1] === to[1] ? from[1] : c + w / 2,
                    ],
                });
            },
        });
        if (!token.canceled && this.state.transition?.id === action.id) {
            this.#transitionToken = undefined;
            await this.update({ type: "finish", id: action.id });
        }
    }

    dispose() {
        this.#disposed = true;
        this.#cancelTransition();
        this.#runtime.cancelUpdate(this.#publish);
        this.#runtime.cancelUpdate(this.#finalizeInitial);
        for (const pending of this.#pending.splice(0)) pending.resolve();
        this.#runtime.dispose();
    }
}
