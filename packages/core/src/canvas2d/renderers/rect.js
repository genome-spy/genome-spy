import {
    resolveRectProperties,
    visitRectInstances,
} from "../../rendering/cpu/rect.js";
import { encodeNumber, toSvgString } from "../../svg/svgMarkUtils.js";

/**
 * @param {import("../../marks/mark.js").default} baseMark
 * @param {import("./index.js").CanvasMarkRenderingOptions} options
 */
export function renderRectCanvas(baseMark, options) {
    const mark = /** @type {import("../../marks/rect.js").default} */ (
        baseMark
    );
    const properties = resolveRectProperties(mark);
    if (properties.hatch != "none") {
        options.warn("Canvas2D ignored unsupported rect hatch.");
    }
    if (properties.shadow.opacity > 0) {
        options.warn("Canvas2D ignored unsupported rect shadow.");
    }
    const context = options.context;
    const encoders =
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    /** @type {string | undefined} */
    let fillStyle;

    /** @type {string | undefined} */
    let strokeStyle;
    const radii = [0, 0, 0, 0];

    return visitRectInstances(mark, properties, options, (instance) => {
        const opacityFactor = instance.opacityFactor;
        const fillVisible = instance.fill != "none" && instance.fillOpacity > 0;
        const stroke = toSvgString(encoders.stroke(instance.datum));
        const strokeOpacity =
            encodeNumber(encoders.strokeOpacity, instance.datum) *
            options.viewOpacity *
            opacityFactor;
        const strokeVisible =
            stroke != "none" && strokeOpacity > 0 && instance.strokeWidth > 0;
        const rounded =
            instance.radii.topLeft != 0 ||
            instance.radii.topRight != 0 ||
            instance.radii.bottomRight != 0 ||
            instance.radii.bottomLeft != 0;
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
