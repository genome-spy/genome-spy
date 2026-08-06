/**
 * Formats a CSS-pixel value with enough precision for display and print while
 * avoiding verbose floating-point coordinates in serialized SVG.
 *
 * @param {number} value
 */
export function formatSvgNumber(value) {
    const rounded = +value.toFixed(1);
    return Object.is(rounded, -0) ? 0 : rounded;
}
