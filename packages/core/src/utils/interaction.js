import {
    createPrimitiveEventProxy,
    isWheelEvent,
    overrideWheelEventDeltas,
} from "./interactionEvent.js";

/**
 * Internal interaction object used by the refactored interaction pipeline.
 * This is intentionally smaller and less DOM-like than the legacy
 * InteractionEvent wrapper.
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
