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
    const fontFamily = createNativeFontFamily(props.font);
    const fontPrefix = `${props.fontStyle ?? "normal"} ${normalizeFontWeight(props.fontWeight ?? "normal")} `;
    const textBaseline =
        properties.baseline == "baseline" ? "alphabetic" : properties.baseline;
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
    /** @type {number | undefined} */
    let fontSize;

    if (!properties.logoLetters) {
        context.textAlign = properties.align;
        context.textBaseline = textBaseline;
    }

    return visitTextInstances(mark, properties, options, (instance) => {
        if (instance.multiCharacterLogo) {
            options.warn(
                "Canvas2D stretches multi-character logo text as a single glyph cell."
            );
        }
        const fill = toPaintString(encoders.color(instance.datum));
        const opacity =
            encodeNumber(encoders.opacity, instance.datum) *
            options.viewOpacity *
            instance.fadeOpacity;
        if (fill == "none" || opacity <= 0) {
            return;
        }
        if (fillStyle != fill) {
            context.fillStyle = fill;
            fillStyle = fill;
        }
        context.globalAlpha = opacity;
        if (fontSize != instance.size) {
            context.font = `${fontPrefix}${instance.size}px ${fontFamily}`;
            fontSize = instance.size;
        }

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
