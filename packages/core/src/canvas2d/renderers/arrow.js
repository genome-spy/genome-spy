import {
    resolveArrowProperties,
    visitArrowInstances,
} from "../../rendering/cpu/arrow.js";
import { encodeNumber, toSvgString } from "../../svg/svgMarkUtils.js";

/**
 * @param {import("../../marks/mark.js").default} baseMark
 * @param {import("./index.js").CanvasMarkRenderingOptions} options
 */
export function renderArrowCanvas(baseMark, options) {
    const mark = /** @type {import("../../marks/arrow.js").default} */ (
        baseMark
    );
    const context = options.context;
    const encoders =
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const properties = resolveArrowProperties(mark);
    context.lineJoin = "miter";
    /** @type {string | undefined} */
    let fillStyle;
    /** @type {string | undefined} */
    let strokeStyle;

    return visitArrowInstances(mark, properties, options, (instance) => {
        if (instance.headShapeFallback) {
            options.warn(
                `Canvas2D rendered unsupported arrow headShape "${properties.headShape}" as a triangle.`
            );
        }
        context.beginPath();
        for (const loop of instance.boundaryLoops) {
            const first = loop[0];
            context.moveTo(first.x, first.y);
            for (let i = 1; i < loop.length; i++) {
                context.lineTo(loop[i].x, loop[i].y);
            }
            context.closePath();
        }

        const fill = toSvgString(encoders.fill(instance.datum));
        const fillOpacity =
            encodeNumber(encoders.fillOpacity, instance.datum) *
            options.viewOpacity;
        if (fill != "none" && fillOpacity > 0) {
            if (fillStyle != fill) {
                context.fillStyle = fill;
                fillStyle = fill;
            }
            context.globalAlpha = fillOpacity;
            context.fill();
        }

        const stroke = toSvgString(encoders.stroke(instance.datum));
        const strokeOpacity =
            encodeNumber(encoders.strokeOpacity, instance.datum) *
            options.viewOpacity;
        if (stroke != "none" && strokeOpacity > 0 && instance.strokeWidth > 0) {
            if (strokeStyle != stroke) {
                context.strokeStyle = stroke;
                strokeStyle = stroke;
            }
            context.globalAlpha = strokeOpacity;
            context.lineWidth = instance.strokeWidth;
            context.stroke();
        }
    });
}
