import { rgb } from "d3-color";
import {
    resolveLinkFade,
    normalizeLinkArcFade,
    createFadeStops,
} from "../../immediate/linkFading.js";
import {
    resolveLinkProperties,
    visitLinkInstances,
} from "../../immediate/marks/link.js";
import {
    encodeNumber,
    getDrawConstantPaint,
    toPaintString,
} from "../../immediate/markEncoding.js";

/**
 * @param {import("../../../marks/mark.js").default} baseMark
 * @param {import("./index.js").CanvasMarkRenderingOptions} options
 */
export function renderLinkCanvas(baseMark, options) {
    const mark = /** @type {import("../../../marks/link.js").default} */ (
        baseMark
    );
    const context = options.context;
    const pixelSize = 1 / options.devicePixelRatio;
    const encoders =
        /** @type {Record<string, import("../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const properties = resolveLinkProperties(mark);
    const distances = resolveLinkFade(
        mark,
        properties.shape,
        options.secondOrderPass
    );
    context.lineCap = "butt";
    context.lineJoin = "miter";
    context.miterLimit = 2;
    const constantStroke = getDrawConstantPaint(encoders.color, options);
    /** @type {string | undefined} */
    let strokeStyle;

    return visitLinkInstances(mark, properties, options, (instance) => {
        const stroke =
            constantStroke ?? toPaintString(encoders.color(instance.datum));
        const opacity =
            encodeNumber(encoders.opacity, instance.datum) *
            options.viewOpacity;
        if (stroke == "none" || opacity <= 0 || instance.strokeWidth <= 0) {
            return;
        }
        const fade =
            distances &&
            instance.geometry.type == "cubic" &&
            normalizeLinkArcFade(
                instance.geometry.points[0],
                instance.geometry.points[3],
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
        // Preserve coverage while avoiding unstable subpixel strokes.
        context.globalAlpha =
            opacity * Math.min(instance.strokeWidth / pixelSize, 1);
        context.lineWidth = Math.max(instance.strokeWidth, pixelSize);
        const { geometry } = instance;
        const p1 = geometry.points[0];
        context.beginPath();
        context.moveTo(p1[0], p1[1]);
        if (geometry.type == "orthogonal") {
            for (const point of geometry.points.slice(1)) {
                context.lineTo(point[0], point[1]);
            }
        } else {
            const [, p2, p3, p4] = geometry.points;
            context.bezierCurveTo(p2[0], p2[1], p3[0], p3[1], p4[0], p4[1]);
        }
        context.stroke();
    });
}
