import {
    resolvePointProperties,
    visitPointInstances,
} from "../../immediate/marks/point.js";
import { tracePointPath } from "../../immediate/geometry/pointPath.js";
import {
    encodeNumber,
    getDrawConstantPaint,
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
    const constantFill = getDrawConstantPaint(encoders.fill, options);
    const constantStroke = getDrawConstantPaint(encoders.stroke, options);
    /** @type {string | undefined} */
    let fillStyle;

    /** @type {string | undefined} */
    let strokeStyle;

    return visitPointInstances(mark, properties, options, (instance) => {
        const datum = instance.datum;
        const lineShape = instance.lineShape;
        const fill = constantFill ?? toPaintString(encoders.fill(datum));
        const fillOpacity =
            encodeNumber(encoders.fillOpacity, datum) * options.viewOpacity;
        let stroke = constantStroke ?? toPaintString(encoders.stroke(datum));
        let strokeOpacity =
            encodeNumber(encoders.strokeOpacity, datum) * options.viewOpacity;
        if (lineShape && (stroke == "none" || strokeOpacity <= 0)) {
            stroke = fill;
            strokeOpacity = fillOpacity;
        }

        const hasFill = !lineShape && fill != "none" && fillOpacity > 0;
        const fillRadius =
            strokeOpacity < 1 || stroke == "none"
                ? instance.radius
                : instance.geometryRadius;
        tracePointCanvas(
            context,
            instance,
            hasFill ? fillRadius : instance.geometryRadius,
            options.warn
        );

        if (hasFill) {
            if (fillStyle != fill) {
                context.fillStyle = fill;
                fillStyle = fill;
            }
            setAlpha(context, fillOpacity);
            context.fill();
        }
        if (stroke != "none" && strokeOpacity > 0 && instance.strokeWidth > 0) {
            // Opaque strokes and centered points reuse the fill path.
            if (hasFill && fillRadius != instance.geometryRadius) {
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
            setLineWidth(context, instance.strokeWidth);
            context.stroke();
        }
    });
}

/**
 * @param {CanvasRenderingContext2D} context
 * @param {import("../../immediate/marks/point.js").PointInstance} instance
 * @param {number} radius
 * @param {(message: string) => void} warn
 */
function tracePointCanvas(context, instance, radius, warn) {
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
        context.arc(x, y, radius, 0, Math.PI * 2);
    } else if (instance.shape == "square") {
        context.rect(x - radius, y - radius, radius * 2, radius * 2);
    } else {
        supported = tracePointPath(instance.shape, x, y, radius, context);
    }
    if (rotated) {
        context.restore();
    }

    if (!supported) {
        warn(
            `Canvas2D rendered unsupported point shape "${instance.shape}" as a circle.`
        );
        context.arc(instance.x, instance.y, radius, 0, Math.PI * 2);
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
