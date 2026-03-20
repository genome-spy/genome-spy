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
 * @typedef {Pick<
 *      WheelEvent,
 *      "type" | "deltaX" | "deltaY" | "deltaMode" | "preventDefault" | "ctrlKey"
 * >} WheelLikeEvent
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
 * @param {unknown} eventLike
 * @returns {eventLike is WheelLikeEvent}
 */
export function isWheelEvent(eventLike) {
    if (!eventLike || typeof eventLike !== "object") {
        return false;
    }

    const candidate =
        /** @type {{type?: unknown, deltaX?: unknown, deltaY?: unknown, deltaMode?: unknown, preventDefault?: unknown}} */ (
            eventLike
        );

    return (
        candidate.type === "wheel" &&
        Number.isFinite(candidate.deltaX) &&
        Number.isFinite(candidate.deltaY) &&
        Number.isFinite(candidate.deltaMode) &&
        typeof candidate.preventDefault === "function"
    );
}

/**
 * @param {WheelLikeEvent} wheelEvent
 * @param {number} deltaX
 * @param {number} deltaY
 * @returns {WheelLikeEvent}
 */
export function overrideWheelEventDeltas(wheelEvent, deltaX, deltaY) {
    return new Proxy(wheelEvent, {
        get(target, prop, receiver) {
            if (prop === "deltaX") {
                return deltaX;
            } else if (prop === "deltaY") {
                return deltaY;
            }

            return Reflect.get(target, prop, receiver);
        },
    });
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
