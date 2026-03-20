import {
    createPrimitiveEventProxy,
    isWheelEvent,
    overrideWheelEventDeltas,
} from "./interactionEvent.js";

/**
 * Internal event object used by GenomeSpy's canvas interaction pipeline.
 *
 * Interaction is deliberately smaller than DOM Event. It models the pieces
 * that GenomeSpy needs for hierarchical pointer handling:
 * - `point` is always in canvas coordinates
 * - `uiEvent` is the original native or synthesized low-level event
 * - `target` is the resolved deepest view target after propagation
 * - `currentTarget` and `relatedTarget` are used by synthesized
 *   `mouseenter` / `mouseleave` delivery
 *
 * Runtime flow:
 * 1. `InteractionController` converts native canvas events into Interaction
 *    instances and asks `InteractionDispatcher` to route them.
 * 2. Container views route the interaction through the view hierarchy and may
 *    add policy on top, such as wheel claiming, zoom handling, or scrollbar
 *    dispatch.
 * 3. `InteractionDispatcher` compares successive hover paths and synthesizes
 *    subtree-level `mouseenter` / `mouseleave` transitions.
 *
 * Differences from the DOM model:
 * - propagation is view-driven rather than browser-driven
 * - only the event types used by GenomeSpy are represented
 * - there is only `stopPropagation()`, not stop-immediate semantics
 * - mark picking is not encoded into `target`; mark hover lives separately in
 *   `InteractionController`
 *
 * Mouse and wheel helpers:
 * - `mouseEvent` exposes the underlying MouseEvent for imperative handlers
 * - `proxiedMouseEvent` exposes only primitive properties for places that
 *   must not retain live DOM objects
 * - `wheelEvent` exposes the underlying wheel-like event, optionally with
 *   temporary delta overrides applied by `setWheelDeltas()`
 *
 * Special event types:
 * - `wheelclaimprobe` asks pointed views whether they would consume wheel,
 *   without running the actual wheel side effects yet
 * - `touchgesture` is a synthesized high-level gesture event derived from
 *   touch input
 */
export default class Interaction {
    /** @type {MouseEvent} */
    #primitiveMouseEventProxy;

    /** @type {import("./interactionEvent.js").WheelLikeEvent | undefined} */
    #wheelEventProxy;

    /**
     * @param {import("../view/layout/point.js").default} point
     * @param {import("./interactionEvent.js").InteractionUiEvent} uiEvent
     * @param {string} [type]
     */
    constructor(point, uiEvent, type) {
        this.point = point;
        this.#uiEvent = uiEvent;
        this.stopped = false;
        this.wheelClaimed = false;
        this.#typeOverride = type;

        /**
         * The target is known only after the interaction has been resolved
         * against the view hierarchy.
         *
         * @type {import("../view/view.js").default | undefined}
         */
        this.target = undefined;

        /**
         * Reserved for the new interaction dispatcher.
         *
         * @type {import("../view/view.js").default | undefined}
         */
        this.currentTarget = undefined;

        /**
         * Reserved for enter/leave-style transition events.
         *
         * @type {import("../view/view.js").default | undefined}
         */
        this.relatedTarget = undefined;
    }

    /** @type {import("./interactionEvent.js").InteractionUiEvent} */
    #uiEvent;
    /** @type {string | undefined} */
    #typeOverride;
    /** @type {{ deltaX: number, deltaY: number } | undefined} */
    #wheelDeltaOverride;

    get uiEvent() {
        return this.#uiEvent;
    }

    set uiEvent(value) {
        this.#uiEvent = value;
        this.#primitiveMouseEventProxy = undefined;
        this.#wheelEventProxy = undefined;
        this.#wheelDeltaOverride = undefined;
    }

    stopPropagation() {
        this.stopped = true;
    }

    /**
     * Marks the current wheel interaction as claimed by the pointed view
     * hierarchy.
     *
     * This is used both for real wheel events and for the synthetic
     * `wheelclaimprobe` preflight. Controllers use the claimed state to decide
     * whether the native wheel event should call `preventDefault()`.
     */
    claimWheel() {
        if (this.type !== "wheel" && this.type !== "wheelclaimprobe") {
            throw new Error("Can claim wheel only for wheel events!");
        }

        this.wheelClaimed = true;
    }

    /**
     * @param {number} deltaX
     * @param {number} deltaY
     */
    setWheelDeltas(deltaX, deltaY) {
        if (!isWheelEvent(this.uiEvent)) {
            throw new Error("Not a WheelEvent!");
        }

        this.#wheelDeltaOverride = { deltaX, deltaY };
        this.#wheelEventProxy = undefined;
    }

    get type() {
        return this.#typeOverride ?? this.uiEvent.type;
    }

    set type(value) {
        this.#typeOverride = value;
    }

    /**
     * Returns a primitive-only proxy of the underlying MouseEvent.
     *
     * This is intended for places such as expression evaluation, where the
     * caller needs scalar event fields but should not receive a live DOM event
     * object with methods, nested objects, or browser-specific prototypes.
     */
    get proxiedMouseEvent() {
        if (!this.#primitiveMouseEventProxy) {
            this.#primitiveMouseEventProxy = createPrimitiveEventProxy(
                this.mouseEvent
            );
        }

        return this.#primitiveMouseEventProxy;
    }

    get mouseEvent() {
        if (this.uiEvent instanceof MouseEvent) {
            return this.uiEvent;
        } else {
            throw new Error("Not a MouseEvent!");
        }
    }

    /**
     * Returns a wheel-like event with any temporary delta overrides applied.
     *
     * The wrapped event keeps the original event identity for all properties
     * except `deltaX` and `deltaY`, which allows intermediate handlers to
     * consume part of the wheel interaction while keeping downstream wheel
     * handling on the same event instance.
     */
    get wheelEvent() {
        if (!isWheelEvent(this.uiEvent)) {
            throw new Error("Not a WheelEvent!");
        }

        if (!this.#wheelDeltaOverride) {
            return this.uiEvent;
        }

        if (!this.#wheelEventProxy) {
            this.#wheelEventProxy = overrideWheelEventDeltas(
                this.uiEvent,
                this.#wheelDeltaOverride.deltaX,
                this.#wheelDeltaOverride.deltaY
            );
        }

        return this.#wheelEventProxy;
    }
}
