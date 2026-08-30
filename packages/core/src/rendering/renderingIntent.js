/**
 * Returns the backend-neutral raster quality intent for a Core mark.
 *
 * Four-sample coverage is deliberately limited to undecorated rectangles
 * packed by a source-backed sample channel or sample-facet index. Capable
 * raster backends may honor the intent; other backends keep their existing
 * rendering path.
 *
 * @param {import("../marks/mark.js").default} mark
 * @returns {{ sampleCount: 1 | 4 }}
 */
export function getMarkRenderingIntent(mark) {
    return { sampleCount: isPlainSampleFacetedRect(mark) ? 4 : 1 };
}

/** @param {import("../marks/mark.js").default} mark */
function isPlainSampleFacetedRect(mark) {
    if (
        (!mark.encoders?.facetIndex && !mark.encoders?.sample) ||
        mark.getType() !== "rect"
    ) {
        return false;
    }

    const stroke = mark.encoding.stroke;
    if (
        stroke != null &&
        (!("value" in stroke) || stroke.value !== null || "condition" in stroke)
    ) {
        return false;
    }

    const properties = /** @type {import("../spec/mark.js").RectProps} */ (
        mark.properties
    );
    return (
        isZero(properties.cornerRadius) &&
        isZero(properties.cornerRadiusTopLeft) &&
        isZero(properties.cornerRadiusTopRight) &&
        isZero(properties.cornerRadiusBottomLeft) &&
        isZero(properties.cornerRadiusBottomRight) &&
        isZero(properties.shadowOpacity) &&
        (properties.hatch === undefined || properties.hatch === "none")
    );
}

/** @param {unknown} value */
function isZero(value) {
    return value === undefined || value === 0;
}
