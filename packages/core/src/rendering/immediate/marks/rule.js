import { isMarkClamped } from "../../../marks/markUtils.js";
import { intersectsBounds } from "../bounds.js";
import clipSegment from "../../../utils/clipSegment.js";
import {
    encodeNumber,
    getDrawConstantPaint,
    getPaintOpacityAccessor,
    toPaintString,
    prepareRangeProjection,
    resolveMarkProperty,
} from "../markEncoding.js";

/**
 * @typedef {object} RuleInstance
 * @prop {object} datum
 * @prop {number} x1
 * @prop {number} y1
 * @prop {number} x2
 * @prop {number} y2
 * @prop {number} size
 * @prop {number} strokeWidth
 * @prop {string} stroke
 * @prop {number} strokeOpacity
 */

/** @param {import("../../../marks/rule.js").default} mark */
export function resolveRuleProperties(mark) {
    return {
        strokeAlign:
            mark.getType() === "rule"
                ? resolveMarkProperty(
                      mark,
                      /** @type {import("../../../spec/mark.js").RuleProps} */ (
                          mark.properties
                      ).strokeAlign
                  )
                : "outside",
        minLength: resolveMarkProperty(mark, mark.properties.minLength),
        strokeCap: resolveMarkProperty(mark, mark.properties.strokeCap),
    };
}

/**
 * @param {import("../../../marks/rule.js").default} mark
 * @param {ReturnType<typeof resolveRuleProperties>} properties
 * @param {{coords: import("../../../view/layout/rectangle.js").default, data: object[], visibleBounds: import("../bounds.js").RenderBounds, start?: number, end?: number}} options
 * @param {(instance: RuleInstance) => void} visitor
 */
export function visitRuleInstances(mark, properties, options, visitor) {
    const { coords, data, visibleBounds } = options;
    const encoders =
        /** @type {Record<string, import("../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const start = options.start ?? 0;
    const end = options.end ?? data.length;
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
    /** @type {RuleInstance} */
    const instance = {
        datum: {},
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        size: 0,
        strokeWidth: 0,
        stroke: "none",
        strokeOpacity: 0,
    };
    const clampX = isMarkClamped(mark, "x");
    const clampY = isMarkClamped(mark, "y");
    /** @type {[number, number, number, number]} */
    const segment = [0, 0, 0, 0];
    let instanceCount = 0;
    const isRule = mark.getType() === "rule";
    const constantStroke = isRule
        ? getDrawConstantPaint(encoders.stroke, options)
        : "none";
    const strokeAlpha = isRule
        ? getPaintOpacityAccessor(encoders.stroke)
        : () => 0;

    for (let index = start; index < end; index++) {
        const datum = data[index];
        projectXRange(datum, xRange);
        projectYRange(datum, yRange);
        let [x1, x2] = xRange;
        let [y1, y2] = yRange;
        const size = encodeNumber(encoders.size, datum);
        if (size <= 0) continue;
        const stroke = constantStroke ?? toPaintString(encoders.stroke(datum));
        const strokeOpacity = isRule
            ? encodeNumber(encoders.strokeOpacity, datum)
            : 0;
        const strokeWidth =
            isRule && strokeOpacity * strokeAlpha(stroke) > 0
                ? Math.max(0, encodeNumber(encoders.strokeWidth, datum))
                : 0;
        const padding = size + 2 * strokeWidth + properties.minLength + 1;
        const marginX = Math.max(visibleBounds.x2 - visibleBounds.x1, padding);
        const marginY = Math.max(visibleBounds.y2 - visibleBounds.y1, padding);
        if (
            !clipSegment(
                x1,
                y1,
                x2,
                y2,
                clampX ? coords.x : visibleBounds.x1 - marginX,
                clampY ? coords.y : visibleBounds.y1 - marginY,
                clampX ? coords.x2 : visibleBounds.x2 + marginX,
                clampY ? coords.y2 : visibleBounds.y2 + marginY,
                segment
            )
        ) {
            continue;
        }
        [x1, y1, x2, y2] = segment;
        if (x1 === x2 && y1 === y2) continue;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.hypot(dx, dy);
        if (length > 0 && length < properties.minLength) {
            const expansion = (properties.minLength - length) / 2;
            const ux = dx / length;
            const uy = dy / length;
            x1 -= ux * expansion;
            y1 -= uy * expansion;
            x2 += ux * expansion;
            y2 += uy * expansion;
        }
        if (
            !intersectsBounds(
                visibleBounds,
                x1,
                y1,
                x2,
                y2,
                (size / 2 + strokeWidth) *
                    (properties.strokeCap === "square" ? Math.SQRT2 : 1)
            )
        ) {
            continue;
        }

        instanceCount++;
        instance.datum = datum;
        instance.x1 = x1;
        instance.y1 = y1;
        instance.x2 = x2;
        instance.y2 = y2;
        instance.size = size;
        instance.strokeWidth = strokeWidth;
        instance.stroke = stroke;
        instance.strokeOpacity = strokeOpacity;
        visitor(instance);
    }
    return instanceCount;
}
