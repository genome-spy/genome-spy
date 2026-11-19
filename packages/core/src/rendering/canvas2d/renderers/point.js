import {
    resolvePointProperties,
    visitPointInstances,
} from "../../immediate/marks/point.js";
import { tracePointPath } from "../../immediate/geometry/pointPath.js";
import {
    encodeNumber,
    getDrawConstantPaint,
    getPaintOpacityAccessor,
    resolveMarkProperty,
    toPaintString,
} from "../../immediate/markEncoding.js";

/**
 * @param {import("../../../marks/mark.js").default} baseMark
 * @param {import("./index.js").CanvasMarkRenderingOptions} options
 */
export function renderPointCanvas(baseMark, options) {
    const mark = /** @type {import("../../../marks/point.js").default} */ (
        baseMark
    );
    if (resolveMarkProperty(mark, mark.properties.fillGradientStrength)) {
        options.warn(
            "Canvas2D ignored unsupported point property fillGradientStrength."
        );
    }
    if (mark.properties.geometricZoomBound) {
        options.warn(
            "Canvas2D ignored unsupported point property geometricZoomBound."
        );
    }

    const properties = resolvePointProperties(mark);
    const context = options.context;
    const encoders =
        /** @type {Record<string, import("../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const fillAlpha = getPaintOpacityAccessor(encoders.fill);
    const strokeAlpha = getPaintOpacityAccessor(encoders.stroke);
    const constantFill = getDrawConstantPaint(encoders.fill, options);
    const constantStroke = getDrawConstantPaint(encoders.stroke, options);
    /** @type {string | undefined} */
    let fillStyle;

    /** @type {string | undefined} */
    let strokeStyle;

    /** @param {string} fill @param {number} alpha */
    function drawFill(fill, alpha) {
        if (fillStyle != fill) {
            context.fillStyle = fill;
            fillStyle = fill;
        }
        setAlpha(context, alpha);
        context.fill();
    }

    return visitPointInstances(mark, properties, options, (instance) => {
        const datum = instance.datum;
        const lineShape = instance.lineShape;
        const fill = constantFill ?? toPaintString(encoders.fill(datum));
        const fillOpacity =
            encodeNumber(encoders.fillOpacity, datum) * options.viewOpacity;
        let stroke = constantStroke ?? toPaintString(encoders.stroke(datum));
        let strokeOpacity =
            encodeNumber(encoders.strokeOpacity, datum) * options.viewOpacity;
        let effectiveStrokeOpacity =
            instance.strokeWidth > 0 && strokeOpacity > 0
                ? strokeOpacity * strokeAlpha(stroke)
                : 0;
        if (lineShape && effectiveStrokeOpacity <= 0) {
            stroke = fill;
            strokeOpacity = fillOpacity;
            effectiveStrokeOpacity = fillOpacity * fillAlpha(fill);
        }

        const fillPaintOpacity = lineShape ? 0 : fillOpacity * fillAlpha(fill);
        const hasFill = fillPaintOpacity > 0;
        const outside =
            properties.outsideStroke &&
            !lineShape &&
            effectiveStrokeOpacity > 0;
        const strokeFirst =
            outside && fillPaintOpacity === 1 && instance.radius > 0;
        const fillRadius =
            effectiveStrokeOpacity < 1
                ? instance.radius
                : instance.geometryRadius;
        if (hasFill || !outside) {
            tracePointCanvas(
                context,
                instance,
                hasFill ? fillRadius : instance.geometryRadius,
                options.warn
            );
        }

        if (hasFill && !strokeFirst) {
            drawFill(fill, fillOpacity);
        }
        if (effectiveStrokeOpacity > 0 && instance.strokeWidth > 0) {
            // Opaque strokes and centered points reuse the fill path.
            if (outside && !strokeFirst) {
                tracePointCanvas(
                    context,
                    instance,
                    instance.radius,
                    options.warn,
                    instance.strokeWidth / 2
                );
            } else if (hasFill && fillRadius != instance.geometryRadius) {
                tracePointCanvas(
                    context,
                    instance,
                    instance.geometryRadius,
                    options.warn
                );
            }
            if (lineShape && context.lineCap != "butt") {
                context.lineCap = "butt";
            }
            if (strokeStyle != stroke) {
                context.strokeStyle = stroke;
                strokeStyle = stroke;
            }
            setAlpha(context, strokeOpacity);
            setLineWidth(
                context,
                strokeFirst ? 2 * instance.strokeWidth : instance.strokeWidth
            );
            context.stroke();
        }
        if (strokeFirst) drawFill(fill, fillOpacity);
    });
}

/**
 * @param {CanvasRenderingContext2D} context
 * @param {import("../../immediate/marks/point.js").PointInstance} instance
 * @param {number} radius
 * @param {(message: string) => void} warn
 * @param {number} [outset]
 */
function tracePointCanvas(context, instance, radius, warn, outset = 0) {
    context.beginPath();
    const rotated = instance.angle != 0 && instance.shape != "circle";
    if (rotated) {
        context.save();
        context.translate(instance.x, instance.y);
        context.rotate((instance.angle * Math.PI) / 180);
    }

    const x = rotated ? 0 : instance.x;
    const y = rotated ? 0 : instance.y;
    let supported = true;
    if (instance.shape == "circle") {
        context.arc(x, y, radius + outset, 0, Math.PI * 2);
    } else if (instance.shape == "square") {
        radius += outset;
        context.rect(x - radius, y - radius, radius * 2, radius * 2);
    } else {
        supported = tracePointPath(
            instance.shape,
            x,
            y,
            radius,
            context,
            outset
        );
    }
    if (rotated) {
        context.restore();
    }

    if (!supported) {
        warn(
            `Canvas2D rendered unsupported point shape "${instance.shape}" as a circle.`
        );
        context.arc(instance.x, instance.y, radius + outset, 0, Math.PI * 2);
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
