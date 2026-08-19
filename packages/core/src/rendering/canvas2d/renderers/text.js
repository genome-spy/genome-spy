import {
    normalizeFontWeight,
    resolveTextProperties,
    visitTextInstances,
} from "../../immediate/marks/text.js";
import {
    encodeNumber,
    resolveMarkProperty,
    toPaintString,
} from "../../immediate/markEncoding.js";
import {
    createNativeFontFamily,
    getNativeBaselineOffset,
} from "../../nativeText.js";

/**
 * @param {import("../../../marks/mark.js").default} baseMark
 * @param {import("./index.js").CanvasMarkRenderingOptions} options
 */
export function renderTextCanvas(baseMark, options) {
    const mark = /** @type {import("../../../marks/text.js").default} */ (
        baseMark
    );
    const props = mark.properties;
    const properties = resolveTextProperties(mark);
    const context = options.context;
    const encoders =
        /** @type {Record<string, import("../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    if (
        [
            props.viewportEdgeFadeWidthTop,
            props.viewportEdgeFadeWidthRight,
            props.viewportEdgeFadeWidthBottom,
            props.viewportEdgeFadeWidthLeft,
        ].some((property) => resolveMarkProperty(mark, property) > 0)
    ) {
        options.warn("Canvas2D ignored unsupported text viewport edge fading.");
    }
    /** @type {string | undefined} */
    let fillStyle;
    /** @type {string | undefined} */
    let font;

    return visitTextInstances(mark, properties, options, (instance) => {
        if (instance.multiCharacterLogo) {
            options.warn(
                "Canvas2D stretches multi-character logo text as a single glyph cell."
            );
        }
        if (
            !setPaint(
                context,
                encoders,
                instance.datum,
                options.viewOpacity * instance.fadeOpacity,
                (value) => {
                    if (fillStyle != value) {
                        context.fillStyle = value;
                        fillStyle = value;
                    }
                }
            )
        ) {
            return;
        }
        setFont(props, instance.size, (value) => {
            if (font != value) {
                context.font = value;
                font = value;
            }
        });

        if (instance.logoScale) {
            context.save();
            context.translate(instance.x, instance.y);
            context.rotate((instance.angle * Math.PI) / 180);
            context.translate(instance.dx, instance.dy);
            const glyphWidth = context.measureText(instance.text).width;
            context.scale(
                instance.logoScale.width / glyphWidth,
                instance.logoScale.heightScale
            );
            context.textAlign = "center";
            context.textBaseline = "alphabetic";
            context.fillText(
                instance.text,
                0,
                getNativeBaselineOffset("middle", 1)
            );
            context.restore();
        } else {
            context.textAlign = props.align;
            context.textBaseline =
                props.baseline == "baseline" ? "alphabetic" : props.baseline;
            if (instance.angle) {
                context.save();
                context.translate(instance.x, instance.y);
                context.rotate((instance.angle * Math.PI) / 180);
                context.fillText(
                    instance.text,
                    instance.dx,
                    instance.dy,
                    instance.width
                );
                context.restore();
            } else {
                context.fillText(
                    instance.text,
                    instance.x + instance.dx,
                    instance.y + instance.dy,
                    instance.width
                );
            }
        }
    });
}

/**
 * @param {CanvasRenderingContext2D} context
 * @param {Record<string, import("../../../types/encoder.js").Encoder>} encoders
 * @param {object} datum
 * @param {number} opacityFactor
 * @param {(fill: string) => void} setFill
 */
function setPaint(context, encoders, datum, opacityFactor, setFill) {
    const fill = toPaintString(encoders.color(datum));
    const opacity = encodeNumber(encoders.opacity, datum) * opacityFactor;
    if (fill == "none" || opacity <= 0) {
        return false;
    }
    setFill(fill);
    context.globalAlpha = opacity;
    return true;
}

/**
 * @param {import("../../../marks/text.js").default["properties"]} props
 * @param {number} size
 * @param {(font: string) => void} setValue
 */
function setFont(props, size, setValue) {
    const weight = normalizeFontWeight(props.fontWeight ?? "normal");
    const family = createNativeFontFamily(props.font);
    setValue(`${props.fontStyle ?? "normal"} ${weight} ${size}px ${family}`);
}
