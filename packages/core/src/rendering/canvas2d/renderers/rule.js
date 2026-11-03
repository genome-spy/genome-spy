import {
    resolveRuleProperties,
    visitRuleInstances,
} from "../../immediate/marks/rule.js";
import {
    encodeNumber,
    getDrawConstantPaint,
    resolveMarkProperty,
    toPaintString,
} from "../../immediate/markEncoding.js";

/**
 * @param {import("../../../marks/mark.js").default} baseMark
 * @param {import("./index.js").CanvasMarkRenderingOptions} options
 */
export function renderRuleCanvas(baseMark, options) {
    const mark = /** @type {import("../../../marks/rule.js").default} */ (
        baseMark
    );
    const context = options.context;
    const encoders =
        /** @type {Record<string, import("../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    context.lineCap = resolveMarkProperty(mark, mark.properties.strokeCap);
    context.setLineDash(
        resolveMarkProperty(mark, mark.properties.strokeDash) ?? []
    );
    context.lineDashOffset = resolveMarkProperty(
        mark,
        mark.properties.strokeDashOffset
    );
    const isRule = mark.getType() === "rule";
    const constantStroke = getDrawConstantPaint(encoders.fill, options);
    /** @type {string | undefined} */
    let strokeStyle;

    return visitRuleInstances(
        mark,
        resolveRuleProperties(mark),
        options,
        (instance) => {
            const stroke =
                constantStroke ?? toPaintString(encoders.fill(instance.datum));
            const opacity =
                encodeNumber(encoders.opacity, instance.datum) *
                options.viewOpacity;
            if (opacity <= 0) {
                return;
            }
            context.beginPath();
            context.moveTo(instance.x1, instance.y1);
            context.lineTo(instance.x2, instance.y2);
            // Keep the two native paints together in logical occurrence order.
            if (instance.strokeWidth > 0) {
                context.strokeStyle = instance.stroke;
                strokeStyle = instance.stroke;
                context.globalAlpha = opacity * instance.strokeOpacity;
                context.lineWidth = instance.size + 2 * instance.strokeWidth;
                context.stroke();
            }
            if (stroke === "none") return;
            if (strokeStyle !== stroke) {
                context.strokeStyle = stroke;
                strokeStyle = stroke;
            }
            context.globalAlpha =
                opacity *
                (isRule
                    ? encodeNumber(encoders.fillOpacity, instance.datum)
                    : 1);
            context.lineWidth = instance.size;
            context.stroke();
        }
    );
}
