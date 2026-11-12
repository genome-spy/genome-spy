function createPointerCapture() {
    /** @type {Set<number>} */
    const captured = new Set();

    return {
        /** @param {number} pointerId */
        setPointerCapture(pointerId) {
            captured.add(pointerId);
        },
        /** @param {number} pointerId */
        hasPointerCapture(pointerId) {
            return captured.has(pointerId);
        },
        /** @param {number} pointerId */
        releasePointerCapture(pointerId) {
            captured.delete(pointerId);
        },
    };
}

/** @param {HTMLCanvasElement} canvas */
export function installPointerCapture(canvas) {
    Object.assign(canvas, createPointerCapture());
}

/**
 * @param {string} type
 * @param {PointerEventInit} [init]
 * @returns {PointerEvent}
 */
export function createPointerEvent(
    type,
    { pointerId = 1, pointerType = "mouse", ...init } = {}
) {
    const { PointerEvent, MouseEvent, Event } = globalThis;
    const options = {
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        cancelable: true,
        clientX: 0,
        clientY: 0,
        ...init,
    };
    if (typeof PointerEvent === "function") {
        return new PointerEvent(type, { ...options, pointerId, pointerType });
    }

    const event =
        typeof MouseEvent === "function"
            ? new MouseEvent(type, options)
            : new Event(type, options);
    for (const [name, value] of Object.entries(options)) {
        if (!(name in event)) Object.defineProperty(event, name, { value });
    }
    return /** @type {PointerEvent} */ (
        Object.assign(event, { pointerId, pointerType })
    );
}

/** Canvas stand-in for view tests that bypass native event registration. */
export default class PointerCanvas extends globalThis.EventTarget {
    #capture = createPointerCapture();
    setPointerCapture = this.#capture.setPointerCapture;
    hasPointerCapture = this.#capture.hasPointerCapture;
    releasePointerCapture = this.#capture.releasePointerCapture;

    /**
     * @param {string} type
     * @param {PointerEventInit} [init]
     */
    event(type, init) {
        const event = createPointerEvent(type, init);
        // Direct view dispatch normally runs inside the canvas listener.
        Object.defineProperty(event, "currentTarget", { value: this });
        return event;
    }

    /**
     * @param {string} type
     * @param {PointerEventInit} [init]
     */
    dispatch(type, init) {
        return this.dispatchEvent(createPointerEvent(type, init));
    }
}
