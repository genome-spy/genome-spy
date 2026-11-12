const dragEvents = /** @type {const} */ ([
    "pointermove",
    "pointerup",
    "pointercancel",
    "lostpointercapture",
]);

/**
 * Captures a drag on the canvas and separates release from cancellation.
 * Cleanup and hover resumption happen before release effects.
 *
 * @param {MouseEvent} event The pointerdown being dispatched on the canvas.
 * @param {{
 *     onMove: (event: PointerEvent) => void,
 *     onFinish?: (released: boolean) => void,
 *     onRelease?: (event: PointerEvent) => void,
 *     hoverContext?: Pick<import("../types/viewContext.js").default, "suspendHoverTracking" | "resumeHoverTracking">,
 * }} options
 * @returns {() => boolean} An idempotent cancellation function.
 */
export function startPointerDrag(
    event,
    { onMove, onFinish, onRelease, hoverContext }
) {
    if (!("pointerId" in event) || typeof event.pointerId !== "number") {
        throw new Error("Expected a pointerdown event.");
    }
    const target = /** @type {HTMLCanvasElement} */ (event.currentTarget);
    const { pointerId } = event;
    const controller = new AbortController();
    const { signal } = controller;

    /** @param {PointerEvent} [release] */
    const finish = (release) => {
        if (signal.aborted) return false;

        controller.abort();
        if (target.hasPointerCapture(pointerId)) {
            target.releasePointerCapture(pointerId);
        }
        onFinish?.(release !== undefined);
        hoverContext?.resumeHoverTracking(release);
        if (release) onRelease?.(release);

        return true;
    };

    /** @param {PointerEvent} event */
    const handlePointer = (event) => {
        if (event.pointerId !== pointerId) return;

        if (
            event.type === "pointercancel" ||
            event.type === "lostpointercapture"
        ) {
            finish();
        } else if (event.type === "pointermove" && (event.buttons & 1) !== 0) {
            onMove(event);
        } else {
            // With chorded buttons, primary release arrives as pointermove.
            finish(event);
        }
    };

    target.setPointerCapture(pointerId);
    hoverContext?.suspendHoverTracking();
    for (const type of dragEvents) {
        target.addEventListener(type, handlePointer, { signal });
    }

    return () => finish();
}
