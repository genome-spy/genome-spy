import { createPrimitiveEventProxy } from "./interactionEvent.js";

/**
 * Internal interaction object used by the refactored interaction pipeline.
 * This is intentionally smaller and less DOM-like than the legacy
 * InteractionEvent wrapper.
 */
export default class Interaction {
    /** @type {MouseEvent} */
    #primitiveMouseEventProxy;

    /**
     * @param {import("../view/layout/point.js").default} point
     * @param {import("./interactionEvent.js").InteractionUiEvent} uiEvent
     */
    constructor(point, uiEvent) {
        this.point = point;
        this.#uiEvent = uiEvent;
        this.stopped = false;
        this.wheelClaimed = false;

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

    get uiEvent() {
        return this.#uiEvent;
    }

    set uiEvent(value) {
        this.#uiEvent = value;
        this.#primitiveMouseEventProxy = undefined;
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

    get type() {
        return this.uiEvent.type;
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
}
