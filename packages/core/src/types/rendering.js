/**
 * @param {import("./rendering.js").RenderingOptions} options
 * @returns {import("./rendering.js").ClipOptions | undefined}
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
 * @param {import("../view/layout/rectangle.js").default} rect
 * @param {boolean} clipX
 * @param {boolean} clipY
 * @returns {import("./rendering.js").ClipOptions | undefined}
 */
export function createClipOptions(rect, clipX, clipY) {
    return clipX || clipY ? { rect, clipX, clipY } : undefined;
}

/**
 * @param {import("../view/layout/rectangle.js").default} coords
 * @param {import("./rendering.js").ClipOptions | undefined} clip
 * @returns {import("../view/layout/rectangle.js").default}
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
 * @param {import("./rendering.js").ClipOptions | undefined} current
 * @param {import("./rendering.js").ClipOptions | undefined} next
 * @returns {import("./rendering.js").ClipOptions | undefined}
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
 * @param {import("../spec/mark.js").MarkProps["clip"]} clip
 * @param {import("../view/layout/rectangle.js").default} coords
 * @returns {import("./rendering.js").ClipOptions | undefined}
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
 * @param {import("./rendering.js").RenderingOptions} options
 * @param {import("../spec/mark.js").MarkProps["clip"]} markClip
 * @param {import("../view/layout/rectangle.js").default} coords
 * @returns {import("./rendering.js").ClipOptions | undefined}
 */
export function prepareMarkClipOptions(options, markClip, coords) {
    if (markClip === "never") {
        return undefined;
    } else {
        return combineClipOptions(
            normalizeClipOptions(options),
            createSelfClipOptions(markClip, coords)
        );
    }
}
