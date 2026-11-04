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
    const context = options.context;
    const encoders =
        /** @type {Record<string, import("../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    /** @type {string | undefined} */
    let fillStyle;

    /** @type {string | undefined} */
    let strokeStyle;
    let opaqueFill = false;
    let opaqueStroke = false;
    const radii = [0, 0, 0, 0];
    const bounds = options.visibleBounds;
    const dpr = options.devicePixelRatio;
    const alignedClip =
        Number.isInteger(bounds.x1 * dpr) &&
        Number.isInteger(bounds.y1 * dpr) &&
        Number.isInteger(bounds.x2 * dpr) &&
        Number.isInteger(bounds.y2 * dpr);
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
        const opacityFactor = instance.opacityFactor;
        const fillVisible = instance.fill != "none" && instance.fillOpacity > 0;
        const stroke =
            constantStroke ?? toPaintString(encoders.stroke(instance.datum));
        const strokeOpacity =
            (strokeOpacityIsConstant
                ? constantStrokeOpacity
                : encodeNumber(encoders.strokeOpacity, instance.datum)) *
            options.viewOpacity *
            opacityFactor;
        const strokeVisible =
            !hasInvisibleConstantStroke &&
            stroke != "none" &&
            strokeOpacity > 0 &&
            instance.strokeWidth > 0;
        if (fillVisible && fillStyle != instance.fill) {
            context.fillStyle = fillStyle = instance.fill;
            opaqueFill = isOpaqueStyle(context.fillStyle);
        }
        if (strokeVisible && strokeStyle != stroke) {
            context.strokeStyle = strokeStyle = stroke;
            opaqueStroke = isOpaqueStyle(context.strokeStyle);
        }
        const rounded =
            properties.hasCornerRadii &&
            (instance.radii.topLeft != 0 ||
                instance.radii.topRight != 0 ||
                instance.radii.bottomRight != 0 ||
                instance.radii.bottomLeft != 0);
        // With opaque paints and a full physical pixel between contours, inner
        // coverage lies inside solid outer coverage. Paint S outside, then F
        // inside. Fractional clips would apply edge coverage twice.
        if (
            alignedClip &&
            !rounded &&
            fillVisible &&
            strokeVisible &&
            instance.width > 0 &&
            instance.height > 0 &&
            instance.strokeWidth * options.devicePixelRatio >= 1 &&
            opacityFactor === 1 &&
            instance.fillOpacity === 1 &&
            strokeOpacity === 1 &&
            opaqueFill &&
            opaqueStroke
        ) {
            const half = instance.strokeWidth / 2;
            if (fillStyle !== stroke) {
                context.fillStyle = fillStyle = stroke;
                opaqueFill = opaqueStroke;
            }
            paintRectRows(
                context,
                instance.x - half,
                instance.y - half,
                instance.width + instance.strokeWidth,
                instance.height + instance.strokeWidth,
                options.devicePixelRatio
            );
            if (
                instance.width > instance.strokeWidth &&
                instance.height > instance.strokeWidth
            ) {
                if (fillStyle !== instance.fill) {
                    context.fillStyle = fillStyle = instance.fill;
                    opaqueFill = true;
                }
                paintRectRows(
                    context,
                    instance.x + half,
                    instance.y + half,
                    instance.width - instance.strokeWidth,
                    instance.height - instance.strokeWidth,
                    options.devicePixelRatio
                );
            }
            return;
        }
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
            setAlpha(context, strokeOpacity);
            setLineWidth(context, instance.strokeWidth);
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
        }
    });
}

/**
 * Canvas serializes opaque sRGB paints as hex. Other native color formats keep
 * the ordinary path, without imposing a narrower CSS parser on this backend.
 * @param {string | CanvasGradient | CanvasPattern} style
 */
function isOpaqueStyle(style) {
    return typeof style === "string" && style.length === 7 && style[0] === "#";
}

/**
 * Separate X and Y coverage so live and detached canvases agree at corners.
 * Native rectangle AA can differ between GPU and CPU-backed Canvas surfaces.
 * @param {CanvasRenderingContext2D} context
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {number} dpr
 */
function paintRectRows(context, x, y, width, height, dpr) {
    const top = y * dpr;
    const bottom = (y + height) * dpr;
    const first = Math.floor(top);
    const last = Math.floor(bottom);
    if (first === last) {
        setAlpha(context, bottom - top);
        context.fillRect(x, first / dpr, width, 1 / dpr);
        return;
    }
    const wholeTop = Math.ceil(top);
    if (wholeTop > top) {
        setAlpha(context, wholeTop - top);
        context.fillRect(x, first / dpr, width, 1 / dpr);
    }
    if (last > wholeTop) {
        setAlpha(context, 1);
        context.fillRect(x, wholeTop / dpr, width, (last - wholeTop) / dpr);
    }
    if (bottom > last) {
        setAlpha(context, bottom - last);
        context.fillRect(x, last / dpr, width, 1 / dpr);
    }
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
    const padding = instance.strokeWidth / 2;
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
