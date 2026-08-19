import {
    resolveRuleProperties,
    visitRuleInstances,
} from "../../immediate/marks/rule.js";
import {
    encodeNumber,
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
    /** @type {string | undefined} */
    let strokeStyle;

    return visitRuleInstances(
        mark,
        resolveRuleProperties(mark),
        options,
        (instance) => {
            const stroke = toPaintString(encoders.color(instance.datum));
            const opacity =
                encodeNumber(encoders.opacity, instance.datum) *
                options.viewOpacity;
            if (stroke == "none" || opacity <= 0 || instance.strokeWidth <= 0) {
                return;
            }
            if (strokeStyle != stroke) {
                context.strokeStyle = stroke;
                strokeStyle = stroke;
            }
            context.globalAlpha = opacity;
            context.lineWidth = instance.strokeWidth;
            context.beginPath();
            context.moveTo(instance.x1, instance.y1);
            context.lineTo(instance.x2, instance.y2);
            context.stroke();
        }
    );
}
