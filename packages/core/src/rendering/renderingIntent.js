/**
 * Whether a Core mark benefits from multisampled coverage antialiasing.
 *
 * Four-sample coverage is deliberately limited to undecorated rectangles.
 * Capable raster backends may honor the intent; other backends keep their
 * existing rendering path.
 *
 * @param {import("../marks/mark.js").default} mark
 * @returns {boolean}
 */
export function needsCoverageAntialiasing(mark) {
    if (mark.getType() !== "rect") {
        return false;
    }

    const stroke = mark.encoding.stroke;
    const hasStroke =
        stroke != null &&
        (!("value" in stroke) ||
            stroke.value !== null ||
            "condition" in stroke);

    const properties = /** @type {import("../spec/mark.js").RectProps} */ (
        mark.properties
    );
    return (
        !hasStroke &&
        [
            properties.cornerRadius,
            properties.cornerRadiusTopLeft,
            properties.cornerRadiusTopRight,
            properties.cornerRadiusBottomLeft,
            properties.cornerRadiusBottomRight,
            properties.shadowOpacity,
        ].every((value) => value === undefined || value === 0) &&
        (properties.hatch === undefined || properties.hatch === "none")
    );
}
