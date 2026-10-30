import { color } from "d3-color";

/**
 * Prepare straight RGBA for renderer resources. d3-color represents zero-alpha
 * CSS colors with NaN RGB; invisible paint must still have finite GPU inputs.
 *
 * @param {string} value
 * @returns {[number, number, number, number]}
 */
export function cssColorToRgba(value) {
    const parsed = color(value);
    if (!parsed) {
        throw new Error("Invalid color: " + value);
    }
    const rgb = parsed.rgb();
    const alpha = Math.max(0, Math.min(1, rgb.opacity));
    return alpha === 0
        ? [0, 0, 0, 0]
        : [rgb.r / 255, rgb.g / 255, rgb.b / 255, alpha];
}
