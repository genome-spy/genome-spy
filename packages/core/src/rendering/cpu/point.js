import {
    intersectsSvgBounds,
    isOutsideSvgBounds,
} from "../../svg/svgBounds.js";
import {
    encodeNumber,
    encodePosition,
    encodeString,
    projectX,
    projectY,
    resolveSvgProperty,
} from "../../svg/svgMarkUtils.js";

/**
 * @typedef {object} PointInstance
 * @prop {object} datum
 * @prop {string} shape
 * @prop {number} x
 * @prop {number} y
 * @prop {number} radius
 * @prop {number} geometryRadius
 * @prop {number} angle
 * @prop {number} strokeWidth
 * @prop {boolean} lineShape
 */

/**
 * @param {import("../../marks/point.js").default} mark
 */
export function resolvePointProperties(mark) {
    return {
        inwardStroke: resolveSvgProperty(mark, mark.properties.inwardStroke),
    };
}

/**
 * Visits visible point instances using one mutable record. The visitor must
 * consume each record synchronously and must not retain it.
 *
 * @param {import("../../marks/point.js").default} mark
 * @param {{inwardStroke: boolean}} properties
 * @param {{
 *     coords: import("../../view/layout/rectangle.js").default,
 *     data: object[],
 *     visibleBounds: import("../../svg/svgBounds.js").SvgBounds,
 *     anchorCullBounds: import("../../svg/svgBounds.js").SvgBounds
 * }} options
 * @param {(instance: PointInstance) => void} visitor
 * @returns {number}
 */
export function visitPointInstances(mark, properties, options, visitor) {
    const { coords, data, visibleBounds, anchorCullBounds } = options;
    const encoders =
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const semanticThreshold = mark.getSemanticThreshold();
    /** @type {PointInstance} */
    const instance = {
        datum: {},
        shape: "circle",
        x: 0,
        y: 0,
        radius: 0,
        geometryRadius: 0,
        angle: 0,
        strokeWidth: 0,
        lineShape: false,
    };
    let instanceCount = 0;

    for (const datum of data) {
        const shape = encodeString(encoders.shape, datum);
        if (encodeNumber(encoders.semanticScore, datum) < semanticThreshold) {
            continue;
        }

        const x = projectX(
            coords,
            encodePosition(encoders.x, datum),
            encodeNumber(encoders.xOffset, datum) +
                encodeNumber(encoders.dx, datum)
        );
        const y = projectY(
            coords,
            encodePosition(encoders.y, datum),
            encodeNumber(encoders.yOffset, datum) -
                encodeNumber(encoders.dy, datum)
        );
        if (isOutsideSvgBounds(anchorCullBounds, x, y)) {
            continue;
        }
        const radius = Math.sqrt(encodeNumber(encoders.size, datum)) / 2;
        if (properties.inwardStroke && radius <= 0) {
            continue;
        }
        const strokeWidth = encodeNumber(encoders.strokeWidth, datum);
        const lineShape = shape == "x" || shape == "+";
        const adjustedStrokeWidth =
            properties.inwardStroke && !lineShape
                ? Math.min(strokeWidth, radius)
                : strokeWidth;
        const geometryRadius =
            properties.inwardStroke && !lineShape
                ? radius - adjustedStrokeWidth / 2
                : radius;
        const strokePadding = properties.inwardStroke ? 0 : strokeWidth / 2;
        const conservativeRadius = radius * Math.SQRT2 + strokePadding;
        if (
            !intersectsSvgBounds(
                visibleBounds,
                x - conservativeRadius,
                y - conservativeRadius,
                x + conservativeRadius,
                y + conservativeRadius
            )
        ) {
            continue;
        }

        instanceCount++;
        instance.datum = datum;
        instance.shape = shape;
        instance.x = x;
        instance.y = y;
        instance.radius = radius;
        instance.geometryRadius = geometryRadius;
        instance.angle = encodeNumber(encoders.angle, datum);
        instance.strokeWidth = adjustedStrokeWidth;
        instance.lineShape = lineShape;
        visitor(instance);
    }
    return instanceCount;
}
