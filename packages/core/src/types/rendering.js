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
