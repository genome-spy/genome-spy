import { color } from "d3-color";

/**
 * Prepare straight RGBA for renderer resources. d3-color represents zero-alpha
 * CSS colors with NaN RGB; invisible paint must still have finite GPU inputs.
 *
 * @param {string} value
 * @returns {[number, number, number, number]}
 */
export function cssColorToRgba(value) {
    const rgb = parseCssRgb(value);
    const alpha = Math.max(0, Math.min(1, rgb.opacity));
    return alpha === 0
        ? [0, 0, 0, 0]
        : [rgb.r / 255, rgb.g / 255, rgb.b / 255, alpha];
}

/**
 * Pack straight RGBA in byte order from red (least significant) to alpha.
 * @param {unknown} value
 */
export function packCssColor(value) {
    if (value == null) return 0;

    const { r, g, b, opacity } = parseCssRgb(String(value)).clamp();
    const a = Math.round(opacity * 255);
    return (r | (g << 8) | (b << 16) | (a << 24)) >>> 0;
}

/** @param {string} value */
function parseCssRgb(value) {
    const parsed = color(value);
    if (!parsed) {
        throw new Error("Invalid color: " + value);
    }
    return parsed.rgb();
}
