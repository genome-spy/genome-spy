/**
 * @typedef {object} ZoomEvent
 * @prop {number} x
 * @prop {number} y
 * @prop {number} xDelta
 * @prop {number} yDelta
 * @prop {number} zDelta
 */

import { makeLerpSmoother } from "../utils/animator.js";
import makeRingBuffer from "../utils/ringBuffer.js";
import Point from "./layout/point.js";

/**
 * @param {import("../utils/interactionEvent.js").default} event
 * @param {import("./layout/rectangle.js").default} coords
 * @param {(zoomEvent: ZoomEvent) => void} handleZoom
 * @param {import("../types/viewContext.js").Hover} [hover]
 * @param {import("../utils/animator.js").default} [animator]
 */
export default function interactionToZoom(
    event,
    coords,
    handleZoom,
    hover,
    animator
) {
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
        const buffer = makeRingBuffer(5);

        const mouseEvent = /** @type {MouseEvent} */ (event.uiEvent);
        mouseEvent.preventDefault();

        let prevPoint = Point.fromMouseEvent(mouseEvent);

        const onMousemove = /** @param {MouseEvent} moveEvent */ (
            moveEvent
        ) => {
            const point = Point.fromMouseEvent(moveEvent);
            buffer.push(point);

            const delta = point.subtract(prevPoint);

            handleZoom({
                x: prevPoint.x,
                y: prevPoint.y,
                xDelta: delta.x,
                yDelta: delta.y,
                zDelta: 0,
            });

            prevPoint = point;
        };

        const onMouseup = /** @param {MouseEvent} upEvent */ (upEvent) => {
            document.removeEventListener("mousemove", onMousemove);
            document.removeEventListener("mouseup", onMouseup);

            const arr = buffer.get();
            if (animator && arr.length >= 5) {
                const delta = arr[arr.length - 1].subtract(arr[0]);

                let x = prevPoint.x;

                const smoother = makeLerpSmoother(
                    animator,
                    (a) => {
                        handleZoom({
                            x: a,
                            y: prevPoint.y,
                            xDelta: x - a,
                            yDelta: 0,
                            zDelta: 0,
                        });
                        x = a;
                    },
                    300,
                    0.5,
                    x
                );

                smoother(prevPoint.x - delta.x * 5);
            }
        };

        document.addEventListener("mouseup", onMouseup, false);
        document.addEventListener("mousemove", onMousemove, false);
    }
}
