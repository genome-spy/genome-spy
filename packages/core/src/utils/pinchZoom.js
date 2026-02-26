/**
 * @typedef {{clientX: number, clientY: number}} ClientPointLike
 */

/**
 * Returns euclidean distance between two client-space points.
 *
 * @param {ClientPointLike} a
 * @param {ClientPointLike} b
 */
export function getClientDistance(a, b) {
    const dx = b.clientX - a.clientX;
    const dy = b.clientY - a.clientY;
    return Math.hypot(dx, dy);
}

/**
 * Converts a pinch distance ratio to a zDelta used by interactionToZoom:
 * scaleFactor = 2 ** zDelta.
 *
 * @param {number} previousDistance
 * @param {number} currentDistance
 */
export function pinchDistanceToZoomDelta(previousDistance, currentDistance) {
    if (previousDistance <= 0 || currentDistance <= 0) {
        return 0;
    }

    return Math.log2(previousDistance / currentDistance);
}
