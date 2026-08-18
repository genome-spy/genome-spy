import {
    resolvePointProperties,
    visitPointInstances,
} from "../../rendering/cpu/point.js";
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
        if (instance.angle && instance.shape != "circle") {
            options.warn("Canvas2D ignored unsupported point rotation.");
        }
        if (instance.shape != "circle" && instance.shape != "square") {
            options.warn(
                `Canvas2D rendered unsupported point shape "${instance.shape}" as a circle.`
            );
        }

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
        if (instance.shape == "square") {
            const diameter = instance.geometryRadius * 2;
            context.rect(
                instance.x - instance.geometryRadius,
                instance.y - instance.geometryRadius,
                diameter,
                diameter
            );
        } else {
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
