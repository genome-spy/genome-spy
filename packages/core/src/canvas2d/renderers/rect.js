import {
    resolveRectProperties,
    visitRectInstances,
} from "../../rendering/cpu/rect.js";
import { encodeNumber, toSvgString } from "../../svg/svgMarkUtils.js";

/**
 * @param {import("../../marks/mark.js").default} baseMark
 * @param {import("./index.js").CanvasMarkRenderingOptions} options
 */
export function renderRectCanvas(baseMark, options) {
    const mark = /** @type {import("../../marks/rect.js").default} */ (
        baseMark
    );
    const properties = resolveRectProperties(mark);
    if (properties.hatch != "none") {
        options.warn("Canvas2D ignored unsupported rect hatch.");
    }
    if (properties.shadow.opacity > 0) {
        options.warn("Canvas2D ignored unsupported rect shadow.");
    }
    if (
        properties.cornerRadii.topLeft ||
        properties.cornerRadii.topRight ||
        properties.cornerRadii.bottomRight ||
        properties.cornerRadii.bottomLeft
    ) {
        options.warn("Canvas2D ignored unsupported rect corner radius.");
    }

    const context = options.context;
    const encoders =
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    /** @type {string | undefined} */
    let fillStyle;

    /** @type {string | undefined} */
    let strokeStyle;

    return visitRectInstances(mark, properties, options, (instance) => {
        const opacityFactor = instance.opacityFactor;
        if (instance.fill != "none" && instance.fillOpacity > 0) {
            if (fillStyle != instance.fill) {
                context.fillStyle = instance.fill;
                fillStyle = instance.fill;
            }
            setAlpha(context, instance.fillOpacity * opacityFactor);
            context.fillRect(
                instance.x,
                instance.y,
                instance.width,
                instance.height
            );
        }

        const stroke = toSvgString(encoders.stroke(instance.datum));
        const strokeOpacity =
            encodeNumber(encoders.strokeOpacity, instance.datum) *
            options.viewOpacity *
            opacityFactor;
        if (stroke != "none" && strokeOpacity > 0 && instance.strokeWidth > 0) {
            if (strokeStyle != stroke) {
                context.strokeStyle = stroke;
                strokeStyle = stroke;
            }
            setAlpha(context, strokeOpacity);
            setLineWidth(context, instance.strokeWidth);
            context.strokeRect(
                instance.x,
                instance.y,
                instance.width,
                instance.height
            );
        }
    });
}

/** @param {CanvasRenderingContext2D} context @param {number} value */
function setAlpha(context, value) {
    if (context.globalAlpha != value) {
        context.globalAlpha = value;
    }
}

/** @param {CanvasRenderingContext2D} context @param {number} value */
function setLineWidth(context, value) {
    if (context.lineWidth != value) {
        context.lineWidth = value;
    }
}
