/**
 * @param {import("../../types/rendering.js").RenderingOptions} options
 * @returns {import("../../types/rendering.js").ClipOptions | undefined}
 */
export function normalizeClipOptions(options) {
    if (options.clip) {
        return options.clip;
    } else if (options.clipRect) {
        return {
            rect: options.clipRect,
            clipX: true,
            clipY: true,
        };
    } else {
        return undefined;
    }
}

/**
 * @param {import("../../types/rendering.js").ClipOptions | undefined} a
 * @param {import("../../types/rendering.js").ClipOptions | undefined} b
 * @returns {boolean}
 */
export function clipOptionsEqual(a, b) {
    if (a === b) {
        return true;
    } else if (!a || !b) {
        return false;
    } else {
        return (
            a.clipX === b.clipX && a.clipY === b.clipY && a.rect.equals(b.rect)
        );
    }
}

/**
 * @param {import("../layout/rectangle.js").default} rect
 * @param {boolean} clipX
 * @param {boolean} clipY
 * @returns {import("../../types/rendering.js").ClipOptions | undefined}
 */
export function createClipOptions(rect, clipX, clipY) {
    return clipX || clipY ? { rect, clipX, clipY } : undefined;
}

/**
 * @param {import("../layout/rectangle.js").default} coords
 * @param {import("../../types/rendering.js").ClipOptions | undefined} clip
 * @returns {import("../layout/rectangle.js").default}
 */
export function clipCoords(coords, clip) {
    if (!clip) {
        return coords;
    } else if (clip.clipX && clip.clipY) {
        return coords.intersect(clip.rect);
    } else if (clip.clipX) {
        return coords.intersectX(clip.rect);
    } else if (clip.clipY) {
        return coords.intersectY(clip.rect);
    } else {
        return coords;
    }
}

/**
 * @param {import("../../types/rendering.js").ClipOptions | undefined} current
 * @param {import("../../types/rendering.js").ClipOptions | undefined} next
 * @returns {import("../../types/rendering.js").ClipOptions | undefined}
 */
export function combineClipOptions(current, next) {
    if (!current) {
        return next;
    } else if (!next) {
        return current;
    }

    const clipX = current.clipX || next.clipX;
    const clipY = current.clipY || next.clipY;
    const xRect =
        current.clipX && next.clipX
            ? current.rect.intersectX(next.rect)
            : next.clipX
              ? next.rect
              : current.rect;
    const yRect =
        current.clipY && next.clipY
            ? current.rect.intersectY(next.rect)
            : next.clipY
              ? next.rect
              : current.rect;

    return createClipOptions(
        current.rect.modify({
            x: () => xRect.x,
            y: () => yRect.y,
            width: () => xRect.width,
            height: () => yRect.height,
        }),
        clipX,
        clipY
    );
}

/**
 * @param {import("../../spec/mark.js").MarkProps["clip"]} clip
 * @param {import("../layout/rectangle.js").default} coords
 * @returns {import("../../types/rendering.js").ClipOptions | undefined}
 */
export function createSelfClipOptions(clip, coords) {
    if (clip === true) {
        return createClipOptions(coords, true, true);
    } else if (clip === "x") {
        return createClipOptions(coords, true, false);
    } else if (clip === "y") {
        return createClipOptions(coords, false, true);
    } else {
        return undefined;
    }
}

/**
 * @param {import("../../types/rendering.js").ClipOptions | undefined} inheritedClip
 * @param {import("../../spec/mark.js").MarkProps["clip"]} markClip
 * @param {import("../layout/rectangle.js").default} coords
 * @returns {import("../../types/rendering.js").ClipOptions | undefined}
 */
export function prepareMarkClipOptionsFromClip(
    inheritedClip,
    markClip,
    coords
) {
    if (markClip === "never") {
        return undefined;
    } else {
        return combineClipOptions(
            inheritedClip,
            createSelfClipOptions(markClip, coords)
        );
    }
}
