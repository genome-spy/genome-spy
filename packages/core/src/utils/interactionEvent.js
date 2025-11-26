/**
 * This class wraps a MouseEvent (or similar) and allows for
 * its propagation through the view hierarchy in a similar manner
 * as in the DOM.
 */
export default class InteractionEvent {
    /** @type {MouseEvent} */
    #primitiveMouseEventProxy;

    /**
     * @param {import("../view/layout/point.js").default} point Event coordinates
     *      inside the visualization canvas.
     * @param {UIEvent} uiEvent The event to be wrapped
     */
    constructor(point, uiEvent) {
        this.point = point;
        this.uiEvent = uiEvent;
        this.stopped = false;

        /**
         * The target is known only in the bubbling phase
         *
         * @type {import("../view/view.js").default}
         */
        this.target = undefined;
    }

    stopPropagation() {
        this.stopped = true;
    }

    /**
     * The event type string of the underlying UI event (e.g. "click", "keydown").
     *
     * This getter proxies and returns the `type` property from the internal `UIEvent` instance (`this.uiEvent`).
     *
     * @returns {string} The UI event type.
     */
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
