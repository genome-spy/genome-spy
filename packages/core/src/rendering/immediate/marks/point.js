import { pointStrokeAlign } from "../../../marks/point.js";
import clamp from "../../../utils/clamp.js";
import { isMarkClamped } from "../../../marks/markUtils.js";
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
 * @prop {number} radius Nominal radius before insetting the stroke path.
 * @prop {number} geometryRadius
 * @prop {number} boundsRadius
 * @prop {number} angle
 * @prop {number} strokeWidth
 * @prop {boolean} lineShape
 */

/**
 * @param {import("../../../marks/point.js").default} mark
 */
export function resolvePointProperties(mark) {
    const align = pointStrokeAlign(
        resolveMarkProperty(mark, mark.strokeAlignSource)
    );
    return {
        inwardStroke: align === 0,
        outsideStroke: align === 2,
        lineInwardStroke:
            mark.properties.strokeAlign == null
                ? align === 0
                : !!resolveMarkProperty(mark, mark.properties.inwardStroke),
    };
}

/**
 * Visits visible point instances using one mutable record. The visitor must
 * consume each record synchronously and must not retain it.
 *
 * @param {import("../../../marks/point.js").default} mark
 * @param {ReturnType<typeof resolvePointProperties>} properties
 * @param {{
 *     coords: import("../../../view/layout/rectangle.js").default,
 *     data: object[],
 *     visibleBounds: import("../bounds.js").RenderBounds,
 *     anchorCullBounds: import("../bounds.js").RenderBounds,
 *     start?: number,
 *     end?: number
 * }} options
 * @param {(instance: PointInstance) => void} visitor
 * @returns {number}
 */
export function visitPointInstances(mark, properties, options, visitor) {
    const { coords, data, visibleBounds, anchorCullBounds } = options;
    const start = options.start ?? 0;
    const end = options.end ?? data.length;
    const encoders =
        /** @type {Record<string, import("../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    if (start === end) {
        return 0;
    }
    const projectXRange = prepareRangeProjection(
        coords,
        encoders,
        "x",
        data[start]
    );
    const projectYRange = prepareRangeProjection(
        coords,
        encoders,
        "y",
        data[start]
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
        radius: 0,
        geometryRadius: 0,
        boundsRadius: 0,
        angle: 0,
        strokeWidth: 0,
        lineShape: false,
    };
    const clampX = isMarkClamped(mark, "x");
    const clampY = isMarkClamped(mark, "y");
    let instanceCount = 0;

    for (let i = start; i < end; i++) {
        const datum = data[i];
        if (
            encodeNumber(encoders.semanticScore, datum) < semanticThreshold &&
            !mark.isPreservedBySelection(datum)
        ) {
            continue;
        }

        projectXRange(datum, xRange);
        projectYRange(datum, yRange);
        let x = xRange[0] + encodeNumber(encoders.dx, datum);
        let y = yRange[0] - encodeNumber(encoders.dy, datum);
        if (clampX) x = clamp(x, coords.x, coords.x2);
        if (clampY) y = clamp(y, coords.y, coords.y2);
        if (isOutsideBounds(anchorCullBounds, x, y)) {
            continue;
        }
        const radius = Math.sqrt(encodeNumber(encoders.size, datum)) / 2;
        const shape = encodeString(encoders.shape, datum);
        const strokeWidth = encodeNumber(encoders.strokeWidth, datum);
        const lineShape = shape == "x" || shape == "+";
        const inward = lineShape
            ? properties.lineInwardStroke
            : properties.inwardStroke;
        if (inward && radius <= 0) continue;
        const adjustedStrokeWidth =
            inward && !lineShape ? Math.min(strokeWidth, radius) : strokeWidth;
        const geometryRadius =
            inward && !lineShape ? radius - adjustedStrokeWidth / 2 : radius;
        const strokePadding = inward
            ? 0
            : properties.outsideStroke && !lineShape
              ? Math.max(0, strokeWidth) *
                (shape === "circle"
                    ? 1
                    : shape.startsWith("triangle-")
                      ? 2
                      : Math.SQRT2)
              : strokeWidth / 2;
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
        instance.radius = radius;
        instance.geometryRadius = geometryRadius;
        instance.boundsRadius = conservativeRadius;
        instance.angle = encodeNumber(encoders.angle, datum);
        instance.strokeWidth = adjustedStrokeWidth;
        instance.lineShape = lineShape;
        visitor(instance);
    }
    return instanceCount;
}
