import {
    resolveRectProperties,
    visitRectInstances,
} from "../../rendering/cpu/rect.js";
import {
    hasRoundedCorners,
    traceRoundedRectPath,
} from "../../rendering/cpu/roundedRectPath.js";
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

    const roundedRectPath = {
        moveTo(/** @type {number} */ x, /** @type {number} */ y) {
            context.moveTo(x, y);
        },
        horizontalTo(/** @type {number} */ x, /** @type {number} */ y) {
            context.lineTo(x, y);
        },
        verticalTo(/** @type {number} */ x, /** @type {number} */ y) {
            context.lineTo(x, y);
        },
        corner(
            /** @type {number} */ radius,
            /** @type {number} */ x,
            /** @type {number} */ y,
            /** @type {number} */ sharpX,
            /** @type {number} */ sharpY
        ) {
            if (radius) {
                context.arcTo(sharpX, sharpY, x, y, radius);
            } else {
                context.lineTo(sharpX, sharpY);
            }
        },
        closePath() {
            context.closePath();
        },
    };

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
        const rounded = hasRoundedCorners(instance.radii);
        if (rounded && (fillVisible || strokeVisible)) {
            context.beginPath();
            traceRoundedRectPath(
                instance.x,
                instance.y,
                instance.width,
                instance.height,
                instance.radii,
                roundedRectPath
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
