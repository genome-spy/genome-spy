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

/**
 * @typedef {object} ZoomInteractionState
 * @prop {ReturnType<typeof makeLerpSmoother>} smoother
 * @prop {RingBuffer<{point: Point, timestamp: number}>} touchPanEventBuffer
 * @prop {Point | undefined} touchPanLastPoint
 * @prop {0 | 1 | 2} touchPanPointerCount
 */

let lastTimestamp = 0;

/** @type {WeakMap<import("../utils/animator.js").default, ZoomInteractionState>} */
const zoomInteractionStates = new WeakMap();

/** @type {ZoomInteractionState} */
const fallbackInteractionState = createInteractionState();

const MIN_LINK_ENDPOINT_SNAP_DISTANCE = 6;

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
        return fn(...args);
    };
}

/**
 * @param {import("../utils/interaction.js").default} event
 * @param {import("./layout/rectangle.js").default} coords
 * @param {(zoomEvent: ZoomEvent) => boolean | void} handleZoom
 * @param {import("../types/viewContext.js").Hover} [hover]
 * @param {import("../utils/animator.js").default} [animator]
 */
export function interactionToZoom(event, coords, handleZoom, hover, animator) {
    handleZoom = recordTimeStamp(handleZoom);
    const interactionState = getInteractionState(animator);

    if (event.type == "wheel") {
        // TODO: Wheel-zoom inertia should probably be moved here and the faked wheel
        // events in genomeSpy.js and inertia.js should be retired.

        const wheelEvent = event.wheelEvent;
        const wheelMultiplier = wheelEvent.deltaMode ? 120 : 1;

        if (!wheelEvent.deltaX && !wheelEvent.deltaY) {
            return;
        }

        // Stop drag-to-pan inertia
        interactionState.smoother?.stop();

        let { x, y } = event.point;

        // Snapping to the hovered item:
        // - Link marks: snap to the nearest endpoint when cursor is near one.
        // - Other marks: snap to the center if only primary positional channels exist.
        // This allows rapid zooming without constantly adjusting cursor position.

        if (hover) {
            const linkEndpoint = getLinkEndpointSnapPoint(
                event.point,
                coords,
                hover
            );

            if (linkEndpoint) {
                if (linkEndpoint.x !== undefined) {
                    x = linkEndpoint.x;
                }
                if (linkEndpoint.y !== undefined) {
                    y = linkEndpoint.y;
                }
            } else {
                const e = hover.mark.encoders;
                if (e.x && !e.x2 && !e.x.constant) {
                    x =
                        getEncoderUnitPosition(e.x, hover.datum) *
                            coords.width +
                        coords.x;
                }
                if (e.y && !e.y2 && !e.y.constant) {
                    y =
                        (1 - getEncoderUnitPosition(e.y, hover.datum)) *
                            coords.height +
                        coords.y;
                }
            }
        }

        const handled =
            Math.abs(wheelEvent.deltaX) < Math.abs(wheelEvent.deltaY)
                ? handleZoom({
                      x,
                      y,
                      xDelta: 0,
                      yDelta: 0,
                      zDelta: (wheelEvent.deltaY * wheelMultiplier) / 300,
                  }) === true
                : handleZoom({
                      x,
                      y,
                      xDelta: -wheelEvent.deltaX * wheelMultiplier,
                      yDelta: 0,
                      zDelta: 0,
                  }) === true;

        if (handled) {
            wheelEvent.preventDefault();
        }
    } else if (event.type == "mousedown" && event.mouseEvent.button === 0) {
        if (interactionState.smoother) {
            interactionState.smoother.stop();
        }

        /** @type {RingBuffer<{point: Point, timestamp: number}>} */
        const eventBuffer = new RingBuffer(30);

        const mouseEvent = event.mouseEvent;
        mouseEvent.preventDefault();
        event.target?.context.suspendHoverTracking();

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

        const onMouseup = (/** @type {MouseEvent} */ upEvent) => {
            document.removeEventListener("mousemove", onMousemove);
            document.removeEventListener("mouseup", onMouseup);
            event.target?.context.resumeHoverTracking(upEvent);
            startPanInertia(
                interactionState,
                eventBuffer,
                prevPoint,
                handleZoom,
                animator,
                { minSampleCount: 5 }
            );
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
                    interactionState,
                    interactionState.touchPanEventBuffer,
                    interactionState.touchPanLastPoint,
                    handleZoom,
                    animator,
                    {
                        minSampleCount: 2,
                        minVelocityPxPerMs: 0.03,
                    }
                );
            }
            resetTouchPanState(interactionState);
            return;
        }

        if (
            interactionState.touchPanPointerCount !== touchGesture.pointerCount
        ) {
            resetTouchPanState(interactionState);
            interactionState.touchPanPointerCount = touchGesture.pointerCount;
        }

        const currentPoint = new Point(
            event.point.x + xDelta,
            event.point.y + yDelta
        );
        interactionState.touchPanLastPoint = currentPoint;

        if (touchGesture.pointerCount === 1 && (xDelta !== 0 || yDelta !== 0)) {
            interactionState.touchPanEventBuffer.push({
                point: currentPoint,
                timestamp: performance.now(),
            });
        }

        if (xDelta === 0 && yDelta === 0 && zDelta === 0) {
            return;
        }

        // Stop drag-to-pan inertia when touch gestures take over.
        interactionState.smoother?.stop();

        handleZoom({
            x: event.point.x,
            y: event.point.y,
            xDelta,
            yDelta,
            zDelta,
        });
    }
}

/**
 * @param {Point} point
 * @param {import("./layout/rectangle.js").default} coords
 * @param {import("../types/viewContext.js").Hover} hover
 */
function getLinkEndpointSnapPoint(point, coords, hover) {
    if (hover.mark.getType() !== "link") {
        return undefined;
    }

    const e = hover.mark.encoders;
    if (!(e.x && e.y && e.x2 && e.y2)) {
        return undefined;
    }

    const snapX = !e.x.constant && !e.x2.constant;
    const snapY = !e.y.constant && !e.y2.constant;

    if (!snapX && !snapY) {
        return undefined;
    }

    const x1 =
        getEncoderUnitPosition(e.x, hover.datum) * coords.width + coords.x;
    const y1 =
        (1 - getEncoderUnitPosition(e.y, hover.datum)) * coords.height +
        coords.y;
    const x2 =
        getEncoderUnitPosition(e.x2, hover.datum) * coords.width + coords.x;
    const y2 =
        (1 - getEncoderUnitPosition(e.y2, hover.datum)) * coords.height +
        coords.y;

    let d1Squared = 0;
    let d2Squared = 0;

    if (snapX) {
        d1Squared += (point.x - x1) ** 2;
        d2Squared += (point.x - x2) ** 2;
    }

    if (snapY) {
        d1Squared += (point.y - y1) ** 2;
        d2Squared += (point.y - y2) ** 2;
    }

    const size = e.size ? +e.size(hover.datum) : 0;
    const snapDistance = Number.isFinite(size)
        ? Math.max(size, MIN_LINK_ENDPOINT_SNAP_DISTANCE)
        : MIN_LINK_ENDPOINT_SNAP_DISTANCE;
    const snapDistanceSquared = snapDistance * snapDistance;

    if (Math.min(d1Squared, d2Squared) > snapDistanceSquared) {
        return undefined;
    }

    if (d1Squared <= d2Squared) {
        return {
            x: snapX ? x1 : undefined,
            y: snapY ? y1 : undefined,
        };
    } else {
        return {
            x: snapX ? x2 : undefined,
            y: snapY ? y2 : undefined,
        };
    }
}

/**
 * Returns channel position in unit coordinates using the same band placement
 * convention as mark rendering.
 *
 * @param {import("../types/encoder.js").Encoder} encoder
 * @param {import("../data/flowNode.js").Datum} datum
 */
function getEncoderUnitPosition(encoder, datum) {
    const basePosition = +encoder(datum);
    const scale = encoder.scale;

    if (!scale) {
        return basePosition;
    }

    const band = resolveBandPosition(encoder.channelDef);

    if (scale.type === "band" || scale.type === "point") {
        if (!Number.isFinite(band)) {
            return basePosition;
        }

        const typedScale = /** @type {{ bandwidth: () => number }} */ (
            /** @type {any} */ (scale)
        );
        return basePosition + typedScale.bandwidth() * band;
    } else if (scale.type === "index" || scale.type === "locus") {
        if (!Number.isFinite(band)) {
            return basePosition;
        }

        const typedScale =
            /** @type {{ step: () => number, align: () => number }} */ (
                /** @type {any} */ (scale)
            );
        return basePosition + typedScale.step() * (band - typedScale.align());
    } else {
        return basePosition;
    }
}

/**
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 */
function resolveBandPosition(channelDef) {
    if (channelDef && "band" in channelDef) {
        return channelDef.band ?? 0.5;
    } else {
        return 0.5;
    }
}

/**
 * @returns {ZoomInteractionState}
 */
function createInteractionState() {
    return {
        smoother: undefined,
        touchPanEventBuffer: new RingBuffer(30),
        touchPanLastPoint: undefined,
        touchPanPointerCount: 0,
    };
}

/**
 * @param {import("../utils/animator.js").default} [animator]
 */
function getInteractionState(animator) {
    if (!animator) {
        return fallbackInteractionState;
    }

    let state = zoomInteractionStates.get(animator);
    if (!state) {
        state = createInteractionState();
        zoomInteractionStates.set(animator, state);
    }

    return state;
}

/**
 * @param {ZoomInteractionState} interactionState
 */
function resetTouchPanState(interactionState) {
    interactionState.touchPanEventBuffer = new RingBuffer(30);
    interactionState.touchPanLastPoint = undefined;
    interactionState.touchPanPointerCount = 0;
}

/**
 * @param {ZoomInteractionState} interactionState
 * @param {RingBuffer<{point: Point, timestamp: number}>} eventBuffer
 * @param {Point | undefined} lastPoint
 * @param {(zoomEvent: ZoomEvent) => void} handleZoom
 * @param {import("../utils/animator.js").default} [animator]
 * @param {{minSampleCount?: number, minVelocityPxPerMs?: number}} [options]
 */
function startPanInertia(
    interactionState,
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

    interactionState.smoother = makeLerpSmoother(
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

    interactionState.smoother({
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
