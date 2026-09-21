/**
 * @typedef {import("../spec/font.js").FontStyle} FontStyle
 * @typedef {import("../spec/font.js").FontWeight} FontWeight
 * @typedef {{
 *     font?: string,
 *     fontStyle?: FontStyle,
 *     fontWeight?: FontWeight,
 * }} FontConfig
 * @typedef {{
 *     measureWidth: (text: string, fontSize: number) => number,
 *     getHeight: (fontSize: number) => number,
 * }} FontMeasurement
 * @typedef {{
 *     requestFont: (config: FontConfig) => FontMeasurement,
 *     waitUntilReady: () => Promise<void>,
 * }} TextMetricsProvider
 */

/**
 * Requests a font entry and registers asynchronous loading for custom fonts.
 *
 * @param {TextMetricsProvider} provider
 * @param {FontConfig} config
 */
export function requestFont(provider, config) {
    return provider.requestFont(config);
}

/**
 * @param {FontMeasurement} measurement
 * @param {string} text
 * @param {number} fontSize
 */
export function measureText(measurement, text, fontSize) {
    return {
        width: measurement.measureWidth(text, fontSize),
        height: measurement.getHeight(fontSize),
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
