import { acquireOpacityLayer } from "../canvasOpacityLayer.js";
import {
    resolveArrowProperties,
    visitArrowInstances,
} from "../../immediate/marks/arrow.js";
import {
    encodeNumber,
    getDrawConstantPaint,
    toPaintString,
} from "../../immediate/markEncoding.js";

/**
 * @param {import("../../../marks/mark.js").default} baseMark
 * @param {import("./index.js").CanvasMarkRenderingOptions} options
 */
export function renderArrowCanvas(baseMark, options) {
    const mark = /** @type {import("../../../marks/arrow.js").default} */ (
        baseMark
    );
    const parent = options.context;
    const encoders =
        /** @type {Record<string, import("../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const properties = resolveArrowProperties(mark);
    parent.lineJoin = "miter";
    const constantFill = getDrawConstantPaint(encoders.fill, options);
    const constantStroke = getDrawConstantPaint(encoders.stroke, options);
    /** @type {string | undefined} */
    let fillStyle;
    /** @type {string | undefined} */
    let strokeStyle;

    return visitArrowInstances(
        mark,
        properties,
        options,
        (instance) => {
            if (instance.headShapeFallback) {
                options.warn(
                    `Canvas2D rendered unsupported arrow headShape "${properties.headShape}" as a triangle.`
                );
            }
            const opacity =
                encodeNumber(encoders.opacity, instance.datum) *
                options.viewOpacity;
            if (opacity <= 0) return;
            const fill =
                constantFill ?? toPaintString(encoders.fill(instance.datum));
            const fillOpacity = encodeNumber(
                encoders.fillOpacity,
                instance.datum
            );
            const stroke =
                constantStroke ??
                toPaintString(encoders.stroke(instance.datum));
            const strokeOpacity = encodeNumber(
                encoders.strokeOpacity,
                instance.datum
            );
            const fillVisible = fill !== "none" && fillOpacity > 0;
            const strokeVisible =
                stroke !== "none" &&
                strokeOpacity > 0 &&
                instance.strokeWidth > 0;
            const isolated = opacity < 1 && fillVisible && strokeVisible;
            let context = parent;
            let left = 0,
                top = 0,
                width = 0,
                height = 0;
            if (isolated) {
                let x1 = Infinity,
                    y1 = Infinity,
                    x2 = -Infinity,
                    y2 = -Infinity;
                for (const loop of instance.boundaryLoops)
                    for (const point of loop) {
                        x1 = Math.min(x1, point.x);
                        y1 = Math.min(y1, point.y);
                        x2 = Math.max(x2, point.x);
                        y2 = Math.max(y2, point.y);
                    }
                const dpr = options.devicePixelRatio;
                const pad =
                    (instance.strokeWidth * parent.miterLimit) / 2 + 1 / dpr;
                left = Math.floor(
                    Math.max(options.visibleBounds.x1, x1 - pad) * dpr
                );
                top = Math.floor(
                    Math.max(options.visibleBounds.y1, y1 - pad) * dpr
                );
                width =
                    Math.ceil(
                        Math.min(options.visibleBounds.x2, x2 + pad) * dpr
                    ) - left;
                height =
                    Math.ceil(
                        Math.min(options.visibleBounds.y2, y2 + pad) * dpr
                    ) - top;
                if (width <= 0 || height <= 0) return;
                context = acquireOpacityLayer(
                    options.opacityLayers,
                    options.opacityLayerIndex,
                    width,
                    height,
                    true
                );
                context.setTransform(dpr, 0, 0, dpr, -left, -top);
                context.lineJoin = "miter";
                context.miterLimit = parent.miterLimit;
                fillStyle = strokeStyle = undefined;
            }
            const paintOpacity = isolated ? 1 : opacity;
            context.beginPath();
            for (const loop of instance.boundaryLoops) {
                const first = loop[0];
                context.moveTo(first.x, first.y);
                for (let i = 1; i < loop.length; i++) {
                    context.lineTo(loop[i].x, loop[i].y);
                }
                context.closePath();
            }

            if (fillVisible) {
                if (fillStyle != fill) {
                    context.fillStyle = fill;
                    fillStyle = fill;
                }
                context.globalAlpha = fillOpacity * paintOpacity;
                context.fill();
            }

            if (strokeVisible) {
                if (strokeStyle != stroke) {
                    context.strokeStyle = stroke;
                    strokeStyle = stroke;
                }
                context.globalAlpha = strokeOpacity * paintOpacity;
                context.lineWidth = instance.strokeWidth;
                context.stroke();
            }
            if (isolated) {
                parent.globalAlpha = opacity;
                parent.drawImage(
                    context.canvas,
                    0,
                    0,
                    width,
                    height,
                    left / options.devicePixelRatio,
                    top / options.devicePixelRatio,
                    width / options.devicePixelRatio,
                    height / options.devicePixelRatio
                );
                fillStyle = strokeStyle = undefined;
            }
        },
        constantStroke
    );
}
