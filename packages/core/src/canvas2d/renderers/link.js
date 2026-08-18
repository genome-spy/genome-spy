import {
    resolveLinkProperties,
    visitLinkInstances,
} from "../../rendering/cpu/link.js";
import {
    encodeNumber,
    resolveSvgProperty,
    toSvgString,
} from "../../svg/svgMarkUtils.js";

/**
 * @param {import("../../marks/mark.js").default} baseMark
 * @param {import("./index.js").CanvasMarkRenderingOptions} options
 */
export function renderLinkCanvas(baseMark, options) {
    const mark = /** @type {import("../../marks/link.js").default} */ (
        baseMark
    );
    const context = options.context;
    const encoders =
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const arcFadingDistance = resolveSvgProperty(
        mark,
        mark.properties.arcFadingDistance
    );
    const properties = resolveLinkProperties(mark);
    if (
        properties.shape == "arc" &&
        arcFadingDistance !== false &&
        arcFadingDistance[0] > 0 &&
        arcFadingDistance[1] > 0
    ) {
        options.warn("Canvas2D ignored unsupported link arc fading.");
    }
    context.lineCap = "butt";
    /** @type {string | undefined} */
    let strokeStyle;

    return visitLinkInstances(mark, properties, options, (instance) => {
        const stroke = toSvgString(encoders.color(instance.datum));
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
        const [p1, p2, p3, p4] = instance.points;
        context.beginPath();
        context.moveTo(p1[0], p1[1]);
        context.bezierCurveTo(p2[0], p2[1], p3[0], p3[1], p4[0], p4[1]);
        context.stroke();
    });
}
