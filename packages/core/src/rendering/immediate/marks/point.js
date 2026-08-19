import { intersectsBounds, isOutsideBounds } from "../bounds.js";
import {
    encodeNumber,
    encodeString,
    prepareRangeProjection,
    resolveMarkProperty,
} from "../markEncoding.js";

/**
 * @typedef {object} PointInstance
 * @prop {object} datum
 * @prop {string} shape
 * @prop {number} x
 * @prop {number} y
 * @prop {number} geometryRadius
 * @prop {number} angle
 * @prop {number} strokeWidth
 * @prop {boolean} lineShape
 */

/**
 * @param {import("../../../marks/point.js").default} mark
 */
export function resolvePointProperties(mark) {
    return {
        inwardStroke: resolveMarkProperty(mark, mark.properties.inwardStroke),
    };
}

/**
 * Visits visible point instances using one mutable record. The visitor must
 * consume each record synchronously and must not retain it.
 *
 * @param {import("../../../marks/point.js").default} mark
 * @param {{inwardStroke: boolean}} properties
 * @param {{
 *     coords: import("../../../view/layout/rectangle.js").default,
 *     data: object[],
 *     visibleBounds: import("../bounds.js").RenderBounds,
 *     anchorCullBounds: import("../bounds.js").RenderBounds
 * }} options
 * @param {(instance: PointInstance) => void} visitor
 * @returns {number}
 */
export function visitPointInstances(mark, properties, options, visitor) {
    const { coords, data, visibleBounds, anchorCullBounds } = options;
    const encoders =
        /** @type {Record<string, import("../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    if (data.length == 0) {
        return 0;
    }
    const projectXRange = prepareRangeProjection(
        coords,
        encoders,
        "x",
        data[0]
    );
    const projectYRange = prepareRangeProjection(
        coords,
        encoders,
        "y",
        data[0]
    );
    const xRange = /** @type {[number, number]} */ ([0, 0]);
    const yRange = /** @type {[number, number]} */ ([0, 0]);
    const semanticThreshold = mark.getSemanticThreshold();
    /** @type {PointInstance} */
    const instance = {
        datum: {},
        shape: "circle",
        x: 0,
        y: 0,
        geometryRadius: 0,
        angle: 0,
        strokeWidth: 0,
        lineShape: false,
    };
    let instanceCount = 0;

    for (const datum of data) {
        if (encodeNumber(encoders.semanticScore, datum) < semanticThreshold) {
            continue;
        }

        projectXRange(datum, xRange);
        projectYRange(datum, yRange);
        const x = xRange[0] + encodeNumber(encoders.dx, datum);
        const y = yRange[0] - encodeNumber(encoders.dy, datum);
        if (isOutsideBounds(anchorCullBounds, x, y)) {
            continue;
        }
        const radius = Math.sqrt(encodeNumber(encoders.size, datum)) / 2;
        if (properties.inwardStroke && radius <= 0) {
            continue;
        }
        const shape = encodeString(encoders.shape, datum);
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
            !intersectsBounds(
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
        instance.geometryRadius = geometryRadius;
        instance.angle = encodeNumber(encoders.angle, datum);
        instance.strokeWidth = adjustedStrokeWidth;
        instance.lineShape = lineShape;
        visitor(instance);
    }
    return instanceCount;
}
