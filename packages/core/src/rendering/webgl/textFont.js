/**
 * @param {import("../../marks/mark.js").default} mark
 * @returns {import("./fonts/bmFontManager.js").FontEntry}
 */
export function getWebGlTextFont(mark) {
    const manager = /** @type {import("./fonts/bmFontManager.js").default} */ (
        mark.unitView.context.textMetrics
    );
    const properties = /** @type {import("../../spec/mark.js").TextProps} */ (
        mark.properties
    );
    return manager.getFont(
        properties.font,
        properties.fontStyle,
        properties.fontWeight
    );
}
