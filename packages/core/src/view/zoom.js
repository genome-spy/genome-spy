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
import { isTouchGestureEvent } from "../utils/interactionEvent.js";
import Point from "./layout/point.js";

/** @type {ReturnType<typeof makeLerpSmoother>} */
let smoother;

let lastTimestamp = 0;

/** @type {RingBuffer<{point: Point, timestamp: number}>} */
let touchPanEventBuffer = new RingBuffer(30);

/** @type {Point | undefined} */
let touchPanLastPoint;

/** @type {0 | 1 | 2} */
let touchPanPointerCount = 0;

export function markZoomActivity() {
    lastTimestamp = performance.now();
}

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
        markZoomActivity();
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

        const onMouseup = () => {
            document.removeEventListener("mousemove", onMousemove);
            document.removeEventListener("mouseup", onMouseup);
            startPanInertia(eventBuffer, prevPoint, handleZoom, animator, {
                minSampleCount: 5,
            });
        };

        document.addEventListener("mouseup", onMouseup, false);
        document.addEventListener("mousemove", onMousemove, false);
    } else if (event.type == "touchgesture") {
        if (!isTouchGestureEvent(event.uiEvent)) {
            return;
        }

        const touchGesture = event.uiEvent;
        const { xDelta, yDelta, zDelta } = touchGesture;

        if (touchGesture.phase === "end") {
            if (touchGesture.pointerCount === 1) {
                startPanInertia(
                    touchPanEventBuffer,
                    touchPanLastPoint,
                    handleZoom,
                    animator,
                    {
                        minSampleCount: 2,
                        minVelocityPxPerMs: 0.03,
                    }
                );
            }
            resetTouchPanState();
            return;
        }

        if (touchPanPointerCount !== touchGesture.pointerCount) {
            resetTouchPanState();
            touchPanPointerCount = touchGesture.pointerCount;
        }

        const currentPoint = new Point(
            event.point.x + xDelta,
            event.point.y + yDelta
        );
        touchPanLastPoint = currentPoint;

        if (touchGesture.pointerCount === 1 && (xDelta !== 0 || yDelta !== 0)) {
            touchPanEventBuffer.push({
                point: currentPoint,
                timestamp: performance.now(),
            });
        }

        if (xDelta === 0 && yDelta === 0 && zDelta === 0) {
            return;
        }

        // Stop drag-to-pan inertia when touch gestures take over.
        smoother?.stop();

        handleZoom({
            x: event.point.x,
            y: event.point.y,
            xDelta,
            yDelta,
            zDelta,
        });
    }
}

function resetTouchPanState() {
    touchPanEventBuffer = new RingBuffer(30);
    touchPanLastPoint = undefined;
    touchPanPointerCount = 0;
}

/**
 * @param {RingBuffer<{point: Point, timestamp: number}>} eventBuffer
 * @param {Point | undefined} lastPoint
 * @param {(zoomEvent: ZoomEvent) => void} handleZoom
 * @param {import("../utils/animator.js").default} [animator]
 * @param {{minSampleCount?: number, minVelocityPxPerMs?: number}} [options]
 */
function startPanInertia(
    eventBuffer,
    lastPoint,
    handleZoom,
    animator,
    options = {}
) {
    if (!animator || !lastPoint) {
        return;
    }

    const minSampleCount = options.minSampleCount ?? 5;
    const minVelocityPxPerMs = options.minVelocityPxPerMs ?? 0;
    const lastMillisToInclude = 160;
    const now = performance.now();
    const arr = eventBuffer
        .get()
        .filter((point) => now - point.timestamp < lastMillisToInclude);

    if (arr.length < minSampleCount) {
        return;
    }

    if (arr.length >= 5 && isDecelerating(arr)) {
        return;
    }

    const a = arr.at(-1);
    const b = arr[0];
    const v = a.point
        .subtract(b.point)
        .multiply(1 / (a.timestamp - b.timestamp));

    if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) {
        return;
    }

    if (v.length < minVelocityPxPerMs) {
        return;
    }

    let x = lastPoint.x;
    let y = lastPoint.y;

    smoother = makeLerpSmoother(
        animator,
        (point) => {
            handleZoom({
                x: point.x,
                y: point.y,
                xDelta: x - point.x,
                yDelta: y - point.y,
                zDelta: 0,
            });
            x = point.x;
            y = point.y;
        },
        150,
        0.5,
        { x, y }
    );

    smoother({
        x: lastPoint.x - v.x * 250,
        y: lastPoint.y - v.y * 250,
    });
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
