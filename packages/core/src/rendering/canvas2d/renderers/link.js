import { rgb } from "d3-color";
import {
    createLinkFadeEncoder,
    normalizeLinkArcFade,
    createFadeStops,
} from "../../immediate/linkFading.js";
import {
    resolveLinkProperties,
    visitLinkInstances,
} from "../../immediate/marks/link.js";
import { encodeNumber, toPaintString } from "../../immediate/markEncoding.js";

/**
 * @param {import("../../../marks/mark.js").default} baseMark
 * @param {import("./index.js").CanvasMarkRenderingOptions} options
 */
export function renderLinkCanvas(baseMark, options) {
    const mark = /** @type {import("../../../marks/link.js").default} */ (
        baseMark
    );
    const context = options.context;
    const encoders =
        /** @type {Record<string, import("../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const properties = resolveLinkProperties(mark);
    const encodeFade = createLinkFadeEncoder(mark, properties.shape);
    context.lineCap = "butt";
    /** @type {string | undefined} */
    let strokeStyle;

    return visitLinkInstances(mark, properties, options, (instance) => {
        const stroke = toPaintString(encoders.color(instance.datum));
        const opacity =
            encodeNumber(encoders.opacity, instance.datum) *
            options.viewOpacity;
        if (stroke == "none" || opacity <= 0 || instance.strokeWidth <= 0) {
            return;
        }
        const distances = encodeFade(instance.datum);
        const fade =
            distances &&
            normalizeLinkArcFade(
                instance.points[0],
                instance.points[3],
                distances
            );
        if (fade) {
            const { normalX, normalY, offset, start, end } = fade;
            const gradient = context.createLinearGradient(
                normalX * (offset - end),
                normalY * (offset - end),
                normalX * (offset + end),
                normalY * (offset + end)
            );
            const color = rgb(stroke);
            const colorOpacity = color.opacity;
            for (const stop of createFadeStops(start, end)) {
                color.opacity = colorOpacity * stop.opacity;
                gradient.addColorStop(stop.offset, color.formatRgb());
            }
            context.strokeStyle = gradient;
            strokeStyle = undefined;
        } else if (strokeStyle != stroke) {
            context.strokeStyle = stroke;
            strokeStyle = stroke;
        }
        context.globalAlpha = opacity;
        context.lineWidth = instance.strokeWidth;
        const [p1, p2, p3, p4] = instance.points;
        context.beginPath();
        context.moveTo(p1[0], p1[1]);
        context.bezierCurveTo(p2[0], p2[1], p3[0], p3[1], p4[0], p4[1]);
        context.stroke();
    });
}
