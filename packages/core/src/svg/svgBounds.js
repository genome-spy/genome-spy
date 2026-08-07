/**
 * @typedef {object} SvgBounds
 * @prop {number} x1
 * @prop {number} y1
 * @prop {number} x2
 * @prop {number} y2
 */

/**
 * Creates the effective visible bounds for a mark. The root SVG viewport
 * always clips the final image; directional mark clips further restrict the
 * corresponding dimension.
 *
 * @param {number} width
 * @param {number} height
 * @param {import("../types/rendering.js").ClipOptions | undefined} clip
 * @returns {SvgBounds}
 */
export function createSvgVisibleBounds(width, height, clip) {
    return {
        x1: clip?.clipX ? Math.max(0, clip.rect.x) : 0,
        y1: clip?.clipY ? Math.max(0, clip.rect.y) : 0,
        x2: clip?.clipX ? Math.min(width, clip.rect.x2) : width,
        y2: clip?.clipY ? Math.min(height, clip.rect.y2) : height,
    };
}

/**
 * Creates bounds for shader-compatible anchor culling. Unlike visibleBounds,
 * these use the inherited viewport clip even when a mark opts out of pixel
 * clipping with `clip: "never"`. Unselected directions remain unbounded.
 *
 * @param {import("../view/layout/rectangle.js").default} coords
 * @param {import("../types/rendering.js").ClipOptions | undefined} clip
 * @param {import("../spec/mark.js").MarkProps["cullByVisibleRange"]} cull
 * @returns {SvgBounds}
 */
export function createSvgAnchorCullBounds(coords, clip, cull) {
    const cullX = cull === true || cull === "x";
    const cullY = cull === true || cull === "y";
    return {
        x1: cullX ? (clip?.clipX ? clip.rect.x : coords.x) : -Infinity,
        y1: cullY ? (clip?.clipY ? clip.rect.y : coords.y) : -Infinity,
        x2: cullX ? (clip?.clipX ? clip.rect.x2 : coords.x2) : Infinity,
        y2: cullY ? (clip?.clipY ? clip.rect.y2 : coords.y2) : Infinity,
    };
}

/** @param {SvgBounds} bounds */
export function hasVisibleArea(bounds) {
    return bounds.x1 <= bounds.x2 && bounds.y1 <= bounds.y2;
}

/**
 * Tests an anchor against directional culling bounds. Anchors on the boundary
 * remain visible, matching `isOutsideVisibleRange` in the WebGL shaders.
 *
 * @param {SvgBounds} bounds
 * @param {number} x
 * @param {number} y
 */
export function isOutsideSvgBounds(bounds, x, y) {
    return x < bounds.x1 || x > bounds.x2 || y < bounds.y1 || y > bounds.y2;
}

/**
 * Conservatively tests whether axis-aligned geometry can intersect the
 * visible bounds. Touching edges are retained because strokes and
 * antialiasing can still produce visible pixels there.
 *
 * @param {SvgBounds} visibleBounds
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {number} [padding]
 */
export function intersectsSvgBounds(
    visibleBounds,
    x1,
    y1,
    x2,
    y2,
    padding = 0
) {
    return !(
        Math.max(x1, x2) + padding < visibleBounds.x1 ||
        Math.min(x1, x2) - padding > visibleBounds.x2 ||
        Math.max(y1, y2) + padding < visibleBounds.y1 ||
        Math.min(y1, y2) - padding > visibleBounds.y2
    );
}
