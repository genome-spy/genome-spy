/**
 * Tracks a mouse drag beyond the originating view and separates release from
 * cancellation. Cleanup and hover resumption happen before release effects.
 *
 * @param {{
 *     onMove: (event: MouseEvent) => void,
 *     onFinish?: () => void,
 *     onRelease?: (event: MouseEvent) => void,
 *     hoverContext?: Pick<import("../types/viewContext.js").default, "suspendHoverTracking" | "resumeHoverTracking">,
 * }} options
 * @returns {() => boolean} An idempotent cancellation function.
 */
export function startDocumentDrag({
    onMove,
    onFinish,
    onRelease,
    hoverContext,
}) {
    let active = true;

    const finish = (/** @type {MouseEvent | undefined} */ event) => {
        if (!active) {
            return false;
        }

        active = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onMouseup);
        onFinish?.();
        hoverContext?.resumeHoverTracking(event);

        if (event) {
            onRelease?.(event);
        }

        return true;
    };

    const onMouseup = (/** @type {MouseEvent} */ event) => finish(event);

    hoverContext?.suspendHoverTracking();
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onMouseup);

    return () => finish(undefined);
}
