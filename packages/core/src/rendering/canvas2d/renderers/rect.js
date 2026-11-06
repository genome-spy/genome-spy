import { acquireOpacityLayer } from "../canvasOpacityLayer.js";
import {
    resolveRectProperties,
    visitRectInstances,
} from "../../immediate/marks/rect.js";
import {
    encodeNumber,
    getDrawConstantPaint,
    toPaintString,
} from "../../immediate/markEncoding.js";

/**
 * @param {import("../../../marks/mark.js").default} baseMark
 * @param {import("./index.js").CanvasMarkRenderingOptions} options
 */
export function renderRectCanvas(baseMark, options) {
    const mark = /** @type {import("../../../marks/rect.js").default} */ (
        baseMark
    );
    const properties = resolveRectProperties(mark);
    if (properties.hatch != "none") {
        options.warn("Canvas2D ignored unsupported rect hatch.");
    }
    const start = options.start ?? 0;
    if (start === (options.end ?? options.data.length)) {
        return 0;
    }
    let context = options.context;
    const encoders =
        /** @type {Record<string, import("../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    /** @type {string | undefined} */
    let fillStyle;

    /** @type {string | undefined} */
    let strokeStyle;
    const radii = [0, 0, 0, 0];
    const strokeOpacityIsConstant = encoders.strokeOpacity.constant;
    const constantStroke = getDrawConstantPaint(encoders.stroke, options);
    const hasInvisibleConstantStroke = constantStroke == "none";
    const constantStrokeOpacity =
        !hasInvisibleConstantStroke && strokeOpacityIsConstant
            ? encodeNumber(encoders.strokeOpacity, options.data[start])
            : 0;

    return visitRectInstances(mark, properties, options, (instance) => {
        if (properties.shadow.opacity > 0) {
            drawShadow(instance, properties.shadow, options, radii);
        }
        let opacityFactor = instance.opacityFactor;
        const fillVisible = instance.fill != "none" && instance.fillOpacity > 0;
        const stroke =
            constantStroke ?? toPaintString(encoders.stroke(instance.datum));
        const strokeOpacity =
            (strokeOpacityIsConstant
                ? constantStrokeOpacity
                : encodeNumber(encoders.strokeOpacity, instance.datum)) *
            options.viewOpacity;
        const strokeVisible =
            !hasInvisibleConstantStroke &&
            stroke != "none" &&
            strokeOpacity > 0 &&
            instance.strokeWidth > 0;
        const isolated =
            fillVisible &&
            strokeVisible &&
            opacityFactor > 0 &&
            opacityFactor < 1;
        const parent = context;
        const dpr = options.devicePixelRatio;
        let left = 0,
            top = 0,
            width = 0,
            height = 0;
        if (isolated) {
            const pad = instance.strokeOutset + 1 / dpr;
            left = Math.floor(
                Math.max(options.visibleBounds.x1, instance.x - pad) * dpr
            );
            top = Math.floor(
                Math.max(options.visibleBounds.y1, instance.y - pad) * dpr
            );
            width =
                Math.ceil(
                    Math.min(
                        options.visibleBounds.x2,
                        instance.x + instance.width + pad
                    ) * dpr
                ) - left;
            height =
                Math.ceil(
                    Math.min(
                        options.visibleBounds.y2,
                        instance.y + instance.height + pad
                    ) * dpr
                ) - top;
            if (width <= 0 || height <= 0) return;
            context = acquireOpacityLayer(
                options.opacityLayers,
                options.opacityLayerIndex,
                width,
                height
            );
            context.setTransform(dpr, 0, 0, dpr, -left, -top);
            opacityFactor = 1;
            fillStyle = undefined;
            strokeStyle = undefined;
        }
        const rounded =
            properties.hasCornerRadii &&
            (instance.radii.topLeft != 0 ||
                instance.radii.topRight != 0 ||
                instance.radii.bottomRight != 0 ||
                instance.radii.bottomLeft != 0);
        if (rounded && (fillVisible || strokeVisible)) {
            radii[0] = instance.radii.topLeft;
            radii[1] = instance.radii.topRight;
            radii[2] = instance.radii.bottomRight;
            radii[3] = instance.radii.bottomLeft;
            context.beginPath();
            context.roundRect(
                instance.x,
                instance.y,
                instance.width,
                instance.height,
                radii
            );
        }

        if (fillVisible) {
            if (fillStyle != instance.fill) {
                context.fillStyle = instance.fill;
                fillStyle = instance.fill;
            }
            setAlpha(context, instance.fillOpacity * opacityFactor);
            if (rounded) {
                context.fill();
            } else {
                context.fillRect(
                    instance.x,
                    instance.y,
                    instance.width,
                    instance.height
                );
            }
        }

        if (strokeVisible) {
            if (strokeStyle != stroke) {
                context.strokeStyle = stroke;
                strokeStyle = stroke;
            }
            setAlpha(context, strokeOpacity * opacityFactor);
            context.lineJoin = rounded ? "round" : "miter";
            const clipped = properties.strokeAlign !== "center";
            setLineWidth(context, instance.strokeWidth * (clipped ? 2 : 1));
            if (clipped) {
                context.save();
                context.beginPath();
                if (properties.strokeAlign === "outside") {
                    context.rect(
                        options.visibleBounds.x1,
                        options.visibleBounds.y1,
                        options.visibleBounds.x2 - options.visibleBounds.x1,
                        options.visibleBounds.y2 - options.visibleBounds.y1
                    );
                }
                if (rounded)
                    context.roundRect(
                        instance.x,
                        instance.y,
                        instance.width,
                        instance.height,
                        radii
                    );
                else
                    context.rect(
                        instance.x,
                        instance.y,
                        instance.width,
                        instance.height
                    );
                context.clip(
                    properties.strokeAlign === "outside" ? "evenodd" : "nonzero"
                );
                context.beginPath();
                if (rounded)
                    context.roundRect(
                        instance.x,
                        instance.y,
                        instance.width,
                        instance.height,
                        radii
                    );
            }
            if (rounded) {
                context.stroke();
            } else {
                context.strokeRect(
                    instance.x,
                    instance.y,
                    instance.width,
                    instance.height
                );
            }
            if (clipped) context.restore();
        }
        if (isolated) {
            const source = context.canvas;
            context = parent;
            context.save();
            context.globalAlpha = instance.opacityFactor;
            context.drawImage(
                source,
                0,
                0,
                width,
                height,
                left / dpr,
                top / dpr,
                width / dpr,
                height / dpr
            );
            context.restore();
            fillStyle = undefined;
            strokeStyle = undefined;
        }
    });
}

/**
 * Paints a solid silhouette's shadow outside the rect and its stroke, keeping
 * transparent fills clear inside the shape, as in the SVG and GPU renderers.
 *
 * @param {import("../../immediate/marks/rect.js").RectInstance} instance
 * @param {import("../../immediate/marks/rect.js").ResolvedRectProperties["shadow"]} shadow
 * @param {import("./index.js").CanvasMarkRenderingOptions} options
 * @param {number[]} radii Reused scratch space for the expanded corner radii.
 */
function drawShadow(instance, shadow, options, radii) {
    const { context, devicePixelRatio, visibleBounds } = options;
    const padding = instance.strokeOutset;
    const x = instance.x - padding;
    const y = instance.y - padding;
    const width = instance.width + padding * 2;
    const height = instance.height + padding * 2;
    radii[0] = instance.radii.topLeft + padding;
    radii[1] = instance.radii.topRight + padding;
    radii[2] = instance.radii.bottomRight + padding;
    radii[3] = instance.radii.bottomLeft + padding;

    context.save();
    try {
        context.beginPath();
        context.rect(
            visibleBounds.x1,
            visibleBounds.y1,
            visibleBounds.x2 - visibleBounds.x1,
            visibleBounds.y2 - visibleBounds.y1
        );
        context.roundRect(x, y, width, height, radii);
        context.clip("evenodd");

        // Canvas shadow lengths ignore the current transform. Its blur uses
        // sigma = shadowBlur / 2; match the SVG/GPU sigma in physical pixels.
        context.shadowBlur =
            Math.max(shadow.blur / 2.5, 0.25) * 2 * devicePixelRatio;
        context.shadowOffsetX = shadow.offsetX * devicePixelRatio;
        context.shadowOffsetY = shadow.offsetY * devicePixelRatio;
        context.shadowColor = shadow.color;
        context.globalAlpha = shadow.opacity * options.viewOpacity;
        context.fillStyle = "black";
        context.beginPath();
        context.roundRect(x, y, width, height, radii);
        context.fill();
    } finally {
        context.restore();
    }
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
