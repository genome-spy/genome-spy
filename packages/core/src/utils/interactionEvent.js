/**
 * @typedef {object} TouchGestureEvent
 * @prop {"touchgesture"} type
 * @prop {"move" | "end"} phase
 * @prop {1 | 2} pointerCount
 * @prop {number} xDelta
 * @prop {number} yDelta
 * @prop {number} zDelta
 * @prop {() => void} [preventDefault]
 */

/**
 * Side-effect-free query event for wheel ownership. Handlers should only
 * claim wheel if they would consume native wheel at the current pointer
 * location.
 *
 * @typedef {object} WheelClaimProbeEvent
 * @prop {"wheelclaimprobe"} type
 */

/**
 * @typedef {UIEvent | TouchGestureEvent | WheelClaimProbeEvent} InteractionUiEvent
 */

/**
 * @param {unknown} eventLike
 * @returns {eventLike is TouchGestureEvent}
 */
export function isTouchGestureEvent(eventLike) {
    if (!eventLike || typeof eventLike !== "object") {
        return false;
    }

    const candidate =
        /** @type {{type?: unknown, phase?: unknown, pointerCount?: unknown, xDelta?: unknown, yDelta?: unknown, zDelta?: unknown}} */ (
            eventLike
        );

    return (
        candidate.type === "touchgesture" &&
        (candidate.phase === "move" || candidate.phase === "end") &&
        (candidate.pointerCount === 1 || candidate.pointerCount === 2) &&
        Number.isFinite(candidate.xDelta) &&
        Number.isFinite(candidate.yDelta) &&
        Number.isFinite(candidate.zDelta)
    );
}

/**
 * This class wraps a MouseEvent (or similar) and allows for
 * its propagation through the view hierarchy in a similar manner
 * as in the DOM.
 */
export default class InteractionEvent {
    /**
     * @type {{
     *      point: import("../view/layout/point.js").default,
     *      uiEvent: InteractionUiEvent,
     *      type?: string,
     *      stopped: boolean,
     *      wheelClaimed: boolean,
     *      target: import("../view/view.js").default | undefined,
     *      currentTarget: import("../view/view.js").default | undefined,
     *      relatedTarget: import("../view/view.js").default | undefined,
     *      stopPropagation?: () => void,
     *      claimWheel?: () => void,
     *      mouseEvent?: MouseEvent,
     *      proxiedMouseEvent?: MouseEvent,
     * }} */
    #interaction;

    /** @type {MouseEvent} */
    #primitiveMouseEventProxy;

    /**
     * @param {import("../view/layout/point.js").default | {
     *      point: import("../view/layout/point.js").default,
     *      uiEvent: InteractionUiEvent,
     *      type?: string,
     *      stopped: boolean,
     *      wheelClaimed: boolean,
     *      target: import("../view/view.js").default | undefined,
     *      currentTarget: import("../view/view.js").default | undefined,
     *      relatedTarget: import("../view/view.js").default | undefined,
     *      stopPropagation?: () => void,
     *      claimWheel?: () => void,
     *      mouseEvent?: MouseEvent,
     *      proxiedMouseEvent?: MouseEvent,
     * }} pointOrInteraction Event coordinates inside the visualization canvas,
     *      or an internal Interaction-like object.
     * @param {InteractionUiEvent} [uiEvent] The event to be wrapped
     */
    constructor(pointOrInteraction, uiEvent) {
        if (
            pointOrInteraction &&
            typeof pointOrInteraction === "object" &&
            "point" in pointOrInteraction &&
            "uiEvent" in pointOrInteraction &&
            uiEvent === undefined
        ) {
            this.#interaction = /** @type {typeof this.#interaction} */ (
                pointOrInteraction
            );
        } else {
            this.#interaction = {
                point: /** @type {import("../view/layout/point.js").default} */ (
                    pointOrInteraction
                ),
                uiEvent,
                stopped: false,
                wheelClaimed: false,
                target: undefined,
                currentTarget: undefined,
                relatedTarget: undefined,
            };
        }
    }

    get point() {
        return this.#interaction.point;
    }

    set point(value) {
        this.#interaction.point = value;
    }

    get uiEvent() {
        return this.#interaction.uiEvent;
    }

    set uiEvent(value) {
        this.#interaction.uiEvent = value;
        this.#primitiveMouseEventProxy = undefined;
    }

    get interactionType() {
        return this.#interaction.type;
    }

    set interactionType(value) {
        this.#interaction.type = value;
    }

    get stopped() {
        return this.#interaction.stopped;
    }

    set stopped(value) {
        this.#interaction.stopped = value;
    }

    get wheelClaimed() {
        return this.#interaction.wheelClaimed;
    }

    set wheelClaimed(value) {
        this.#interaction.wheelClaimed = value;
    }

    get target() {
        return this.#interaction.target;
    }

    set target(value) {
        this.#interaction.target = value;
    }

    get currentTarget() {
        return this.#interaction.currentTarget;
    }

    set currentTarget(value) {
        this.#interaction.currentTarget = value;
    }

    get relatedTarget() {
        return this.#interaction.relatedTarget;
    }

    set relatedTarget(value) {
        this.#interaction.relatedTarget = value;
    }

    stopPropagation() {
        if (this.#interaction.stopPropagation) {
            this.#interaction.stopPropagation();
        } else {
            this.stopped = true;
        }
    }

    /**
     * Marks the event as wheel-owned by the current interaction path.
     * This is used by native wheel probes to decide preventDefault timing.
     */
    claimWheel() {
        if (this.#interaction.claimWheel) {
            this.#interaction.claimWheel();
        } else {
            if (this.type !== "wheel" && this.type !== "wheelclaimprobe") {
                throw new Error("Can claim wheel only for wheel events!");
            }

            this.wheelClaimed = true;
        }
    }

    /**
     * The event type string of the underlying UI event (e.g. "click", "keydown").
     *
     * This getter proxies and returns the `type` property from the internal `UIEvent` instance (`this.uiEvent`).
     *
     * @returns {string} The UI event type.
     */
    get type() {
        return this.#interaction.type ?? this.#interaction.uiEvent.type;
    }

    get proxiedMouseEvent() {
        if (this.#interaction.proxiedMouseEvent) {
            return this.#interaction.proxiedMouseEvent;
        }

        if (!this.#primitiveMouseEventProxy) {
            this.#primitiveMouseEventProxy = createPrimitiveEventProxy(
                this.mouseEvent
            );
        }

        return this.#primitiveMouseEventProxy;
    }

    get mouseEvent() {
        if (this.#interaction.mouseEvent) {
            return this.#interaction.mouseEvent;
        }

        if (this.uiEvent instanceof MouseEvent) {
            return this.uiEvent;
        } else {
            throw new Error("Not a MouseEvent!");
        }
    }
}

/**
 * Create a safe proxy for an event-like object that exposes only primitive
 * (string, number, boolean, bigint, symbol, undefined) properties and null.
 *
 * @param {T} target The event-like object to wrap.
 * @returns {T} A proxy exposing only primitive properties.
 * @template T
 */
export function createPrimitiveEventProxy(target) {
    /**
     * @param {any} v
     * @returns {boolean}
     */
    const isPrimitiveOrNull = (v) =>
        v === null || (typeof v !== "object" && typeof v !== "function");

    /** @type {ProxyHandler<any>} */
    const handler = {
        /**
         * @param {any} target
         * @param {PropertyKey} prop
         * @param {any} receiver
         */
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, target);
            if (!isPrimitiveOrNull(value)) {
                throw new Error(
                    `Access to non-primitive property "${String(prop)}" is not allowed.`
                );
            }
            return value;
        },

        getPrototypeOf() {
            return null;
        },

        /**
         * @param {any} target
         * @returns {ArrayLike<string|symbol>}
         */
        ownKeys(target) {
            const keys = Reflect.ownKeys(target).filter((k) =>
                isPrimitiveOrNull(target[k])
            );
            return keys.map((k) => (typeof k === "symbol" ? k : String(k)));
        },

        /**
         * @param {any} target
         * @param {PropertyKey} prop
         * @returns {PropertyDescriptor|undefined}
         */
        getOwnPropertyDescriptor(target, prop) {
            const desc = Reflect.getOwnPropertyDescriptor(target, prop);
            if (!desc) return undefined;
            // hide accessor properties (getters/setters)
            if ("get" in desc || "set" in desc) return undefined;
            if (!isPrimitiveOrNull(desc.value)) return undefined;
            // Preserve configurability/enumerability/writability to satisfy proxy invariants
            return {
                value: desc.value,
                writable: !!desc.writable,
                enumerable: !!desc.enumerable,
                configurable: !!desc.configurable,
            };
        },

        /**
         * @param {any} target
         * @param {PropertyKey} prop
         * @returns {boolean} */
        has(target, prop) {
            if (!(prop in target)) return false;
            return isPrimitiveOrNull(target[prop]);
        },
    };

    return new Proxy(target, handler);
}
