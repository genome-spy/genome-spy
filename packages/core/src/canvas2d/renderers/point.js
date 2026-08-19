import {
    resolvePointProperties,
    visitPointInstances,
} from "../../rendering/cpu/point.js";
import { tracePointPath } from "../../rendering/cpu/pointPath.js";
import {
    encodeNumber,
    resolveSvgProperty,
    toSvgString,
} from "../../svg/svgMarkUtils.js";

/**
 * @param {import("../../marks/mark.js").default} baseMark
 * @param {import("./index.js").CanvasMarkRenderingOptions} options
 */
export function renderPointCanvas(baseMark, options) {
    const mark = /** @type {import("../../marks/point.js").default} */ (
        baseMark
    );
    if (resolveSvgProperty(mark, mark.properties.fillGradientStrength)) {
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
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    /** @type {string | undefined} */
    let fillStyle;

    /** @type {string | undefined} */
    let strokeStyle;

    return visitPointInstances(mark, properties, options, (instance) => {
        const datum = instance.datum;
        const lineShape = instance.lineShape;
        const fill = toSvgString(encoders.fill(datum));
        const fillOpacity =
            encodeNumber(encoders.fillOpacity, datum) * options.viewOpacity;
        let stroke = toSvgString(encoders.stroke(datum));
        let strokeOpacity =
            encodeNumber(encoders.strokeOpacity, datum) * options.viewOpacity;
        if (lineShape && (stroke == "none" || strokeOpacity <= 0)) {
            stroke = fill;
            strokeOpacity = fillOpacity;
        }

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
            context.arc(x, y, instance.geometryRadius, 0, Math.PI * 2);
        } else if (instance.shape == "square") {
            const diameter = instance.geometryRadius * 2;
            context.rect(
                x - instance.geometryRadius,
                y - instance.geometryRadius,
                diameter,
                diameter
            );
        } else {
            supported = tracePointPath(
                instance.shape,
                x,
                y,
                instance.geometryRadius,
                context
            );
        }
        if (rotated) {
            context.restore();
        }
        if (!supported) {
            options.warn(
                `Canvas2D rendered unsupported point shape "${instance.shape}" as a circle.`
            );
            context.arc(
                instance.x,
                instance.y,
                instance.geometryRadius,
                0,
                Math.PI * 2
            );
        }

        if (!lineShape && fill != "none" && fillOpacity > 0) {
            if (fillStyle != fill) {
                context.fillStyle = fill;
                fillStyle = fill;
            }
            setAlpha(context, fillOpacity);
            context.fill();
        }
        if (stroke != "none" && strokeOpacity > 0 && instance.strokeWidth > 0) {
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
