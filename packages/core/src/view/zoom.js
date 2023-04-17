/**
 * @typedef {object} ZoomEvent
 * @prop {number} x
 * @prop {number} y
 * @prop {number} xDelta
 * @prop {number} yDelta
 * @prop {number} zDelta
 */

/**
 * @param {import("../utils/interactionEvent").default} event
 * @param {import("./renderingContext/layoutRecorderViewRenderingContext").Rectangle} coords The plot area
 * @param {(zoomEvent: ZoomEvent) => void} handleZoom
 * @param {import("./viewContext").Hover} [hover]
 */
export default function interactionToZoom(event, coords, handleZoom, hover) {
    if (event.type == "wheel") {
        event.uiEvent.preventDefault(); // TODO: Only if there was something zoomable

        const wheelEvent = /** @type {WheelEvent} */ (event.uiEvent);
        const wheelMultiplier = wheelEvent.deltaMode ? 120 : 1;

        let { x, y } = event.point;

        // Snapping to the hovered item:
        // We find the currently hovered object and move the pointed coordinates
        // to its center if the mark has only primary positional channels.
        // This allows the user to rapidly zoom closer without having to
        // continuously adjust the cursor position.

        if (hover) {
            const e = hover.mark.encoders;
            if (e.x && !e.x2 && !e.x.constantValue) {
                x = +e.x(hover.datum) * coords.width + coords.x;
            }
            if (e.y && !e.y2 && !e.y.constantValue) {
                y = (1 - +e.y(hover.datum)) * coords.height + coords.y;
            }
        }

        if (Math.abs(wheelEvent.deltaX) < Math.abs(wheelEvent.deltaY)) {
            handleZoom({
                x,
                y,
                xDelta: 0,
                yDelta: 0,
                zDelta: (wheelEvent.deltaY * wheelMultiplier) / 300,
            });
        } else {
            handleZoom({
                x,
                y,
                xDelta: -wheelEvent.deltaX * wheelMultiplier,
                yDelta: 0,
                zDelta: 0,
            });
        }
    } else if (
        event.type == "mousedown" &&
        /** @type {MouseEvent} */ (event.uiEvent).button === 0
    ) {
        const mouseEvent = /** @type {MouseEvent} */ (event.uiEvent);
        mouseEvent.preventDefault();

        let prevMouseEvent = mouseEvent;

        const onMousemove = /** @param {MouseEvent} moveEvent */ (
            moveEvent
        ) => {
            handleZoom({
                x: prevMouseEvent.clientX,
                y: prevMouseEvent.clientY,
                xDelta: moveEvent.clientX - prevMouseEvent.clientX,
                yDelta: moveEvent.clientY - prevMouseEvent.clientY,
                zDelta: 0,
            });

            prevMouseEvent = moveEvent;
        };

        const onMouseup = /** @param {MouseEvent} upEvent */ (upEvent) => {
            document.removeEventListener("mousemove", onMousemove);
            document.removeEventListener("mouseup", onMouseup);
        };

        document.addEventListener("mouseup", onMouseup, false);
        document.addEventListener("mousemove", onMousemove, false);
    }
}
