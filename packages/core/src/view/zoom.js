/**
 * @typedef {object} ZoomEvent
 * @prop {number} x
 * @prop {number} y
 * @prop {number} xDelta
 * @prop {number} yDelta
 * @prop {number} zDelta
 */

import { makeLerpSmoother } from "../utils/animator.js";
import RingBuffer from "../utils/ringBuffer.js";
import Point from "./layout/point.js";

/** @type {ReturnType<typeof makeLerpSmoother>} */
let smoother;

let lastTimestamp = 0;

export function isStillZooming() {
    const delta = performance.now() - lastTimestamp;
    return delta < 50;
}

/**
 *
 * @param {T} fn
 * @returns {T}
 * @template {Function} T
 */
function recordTimeStamp(fn) {
    // @ts-ignore
    return function (...args) {
        lastTimestamp = performance.now();
        fn(...args);
    };
}

/**
 * @param {import("../utils/interactionEvent.js").default} event
 * @param {import("./layout/rectangle.js").default} coords
 * @param {(zoomEvent: ZoomEvent) => void} handleZoom
 * @param {import("../types/viewContext.js").Hover} [hover]
 * @param {import("../utils/animator.js").default} [animator]
 */
export function interactionToZoom(event, coords, handleZoom, hover, animator) {
    handleZoom = recordTimeStamp(handleZoom);

    if (event.type == "wheel") {
        // TODO: Wheel-zoom inertia should probably be moved here and the faked wheel
        // events in genomeSpy.js and inertia.js should be retired.

        event.uiEvent.preventDefault(); // TODO: Only if there was something zoomable

        const wheelEvent = /** @type {WheelEvent} */ (event.uiEvent);
        const wheelMultiplier = wheelEvent.deltaMode ? 120 : 1;

        if (!wheelEvent.deltaX && !wheelEvent.deltaY) {
            return;
        }

        // Stop drag-to-pan inertia
        smoother?.stop();

        let { x, y } = event.point;

        // Snapping to the hovered item:
        // We find the currently hovered object and move the pointed coordinates
        // to its center if the mark has only primary positional channels.
        // This allows the user to rapidly zoom closer without having to
        // continuously adjust the cursor position.

        if (hover) {
            const e = hover.mark.encoders;
            if (e.x && !e.x2 && !e.x.constant) {
                x = +e.x(hover.datum) * coords.width + coords.x;
            }
            if (e.y && !e.y2 && !e.y.constant) {
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
    } else if (event.type == "mousedown" && event.mouseEvent.button === 0) {
        if (smoother) {
            smoother.stop();
        }

        /** @type {RingBuffer<{point: Point, timestamp: number}>} */
        const eventBuffer = new RingBuffer(30);

        const mouseEvent = event.mouseEvent;
        mouseEvent.preventDefault();

        let prevPoint = Point.fromMouseEvent(mouseEvent);

        const onMousemove = /** @param {MouseEvent} moveEvent */ (
            moveEvent
        ) => {
            const point = Point.fromMouseEvent(moveEvent);
            eventBuffer.push({ point, timestamp: performance.now() });

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

        const animateInertia = () => {
            const lastMillisToInclude = 160;

            const now = performance.now();
            const arr = eventBuffer
                .get()
                .filter((p) => now - p.timestamp < lastMillisToInclude);

            if (arr.length < 5 || !animator || isDecelerating(arr)) {
                return;
            }

            const a = arr.at(-1);
            const b = arr[0];

            const v = a.point
                .subtract(b.point)
                .multiply(1 / (a.timestamp - b.timestamp));

            let x = prevPoint.x;
            let y = prevPoint.y;

            smoother = makeLerpSmoother(
                animator,
                (p) => {
                    handleZoom({
                        x: p.x,
                        y: p.y,
                        xDelta: x - p.x,
                        yDelta: y - p.y,
                        zDelta: 0,
                    });
                    x = p.x;
                    y = p.y;
                },
                150,
                0.5,
                { x, y }
            );

            smoother({
                x: prevPoint.x - v.x * 250,
                y: prevPoint.y - v.y * 250,
            });
        };

        const onMouseup = () => {
            document.removeEventListener("mousemove", onMousemove);
            document.removeEventListener("mouseup", onMouseup);
            animateInertia();
        };

        document.addEventListener("mouseup", onMouseup, false);
        document.addEventListener("mousemove", onMousemove, false);
    }
}

/**
 * Split the array into two vectors and compare their lengths to find out if
 * the mouse movement is decelerating.
 * @param {{point: Point, timestamp: number}[]} arr
 */
function isDecelerating(arr) {
    const mid = arr[Math.floor(arr.length / 2)];

    const ap = mid.point
        .subtract(arr[0].point)
        .multiply(mid.timestamp - arr[0].timestamp);
    const bp = arr
        .at(-1)
        .point.subtract(mid.point)
        .multiply(arr.at(-1).timestamp - mid.timestamp);

    const a = ap.length;
    const b = bp.length;

    // Found by trial and error
    const maxRatio = 0.4;

    return b / a < maxRatio;
}
