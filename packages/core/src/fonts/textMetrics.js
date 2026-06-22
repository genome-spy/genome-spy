/**
 * @typedef {import("./bmFontManager.js").BMFontMetrics} BMFontMetrics
 * @typedef {import("../spec/font.js").FontStyle} FontStyle
 * @typedef {import("../spec/font.js").FontWeight} FontWeight
 * @typedef {{ metrics?: BMFontMetrics, texture?: WebGLTexture }} FontEntryLike
 * @typedef {{
 *     font?: string,
 *     fontStyle?: FontStyle,
 *     fontWeight?: FontWeight,
 * }} FontConfig
 * @typedef {{
 *     getDefaultFont: () => FontEntryLike,
 *     getFont: (
 *         family?: string,
 *         style?: FontStyle,
 *         weight?: FontWeight
 *     ) => FontEntryLike,
 * }} FontManagerLike
 */

/**
 * Requests a font entry and registers asynchronous loading for custom fonts.
 *
 * @param {FontManagerLike} fontManager
 * @param {FontConfig} config
 * @returns {FontEntryLike}
 */
export function requestFont(fontManager, config) {
    return fontManager.getFont(
        config.font,
        config.fontStyle,
        config.fontWeight
    );
}

/**
 * @param {BMFontMetrics} metrics
 * @param {number} fontSize
 */
export function getTextHeight(metrics, fontSize) {
    return (
        ((metrics.capHeight + metrics.descent) / metrics.common.base) * fontSize
    );
}

/**
 * @param {BMFontMetrics} metrics
 * @param {string} text
 * @param {number} fontSize
 */
export function measureText(metrics, text, fontSize) {
    return {
        width: metrics.measureWidth(text, fontSize),
        height: getTextHeight(metrics, fontSize),
    };
}

/**
 * Returns the projected text extent along a layout direction after rotation.
 *
 * @param {{ width: number, height: number }} size
 * @param {number} angle
 * @param {"horizontal" | "vertical"} direction
 */
export function getProjectedTextExtent(size, angle, direction) {
    const radians = (angle * Math.PI) / 180;
    const absSin = Math.abs(Math.sin(radians));
    const absCos = Math.abs(Math.cos(radians));

    return direction == "vertical"
        ? size.width * absSin + size.height * absCos
        : size.width * absCos + size.height * absSin;
}
