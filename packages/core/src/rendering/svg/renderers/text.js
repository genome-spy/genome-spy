import {
    resolveTextProperties,
    visitTextInstances,
} from "../../immediate/marks/text.js";
import { createSvgElement } from "../svgElement.js";
import {
    resolveMarkProperty,
    toPaintString,
} from "../../immediate/markEncoding.js";
import { createSvgAttributeEncoder } from "../svgAttributes.js";
import { formatSvgNumber, formatSvgUnitless } from "../svgNumber.js";
import {
    createNativeFontFamily,
    getNativeBaselineOffset,
    normalizeFontWeight,
} from "../../nativeText.js";
import { requestLogoInkBounds } from "../../nativeTextMetrics.js";

/**
 * @param {import("../../../marks/mark.js").default} baseMark
 * @param {import("../svgViewRenderingContext.js").SvgMarkRenderingOptions} options
 */
export function renderTextSvg(baseMark, options) {
    const mark = /** @type {import("../../../marks/text.js").default} */ (
        baseMark
    );
    const props = mark.properties;
    const textMetrics =
        options.textMetrics ?? mark.unitView.context.textMetrics;
    const fontMeasurement = textMetrics.requestFont(props);
    const measureLogoInkBounds = requestLogoInkBounds(textMetrics, props);
    const properties = resolveTextProperties(mark);
    const {
        coords,
        data,
        group,
        viewOpacity,
        visibleBounds,
        anchorCullBounds,
    } = options;
    const encoders =
        /** @type {Record<string, import("../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const encodeStyles = createSvgAttributeEncoder(group, {
        fill: { encoder: encoders.color, transform: toPaintString },
        "fill-opacity": {
            encoder: encoders.opacity,
            transform: (value) => +value * viewOpacity,
        },
        "font-size": {
            encoder: encoders.size,
            transform: (value) => formatSvgNumber(+value),
        },
    });
    group.setAttribute("font-family", createNativeFontFamily(props.font));
    group.setAttribute("font-style", props.fontStyle ?? "normal");
    group.setAttribute(
        "font-weight",
        "" + normalizeFontWeight(props.fontWeight ?? "normal")
    );
    group.setAttribute("text-anchor", textAnchors[properties.align]);

    const edgeFade = {
        top: {
            width: resolveMarkProperty(mark, props.viewportEdgeFadeWidthTop),
            distance: resolveMarkProperty(
                mark,
                props.viewportEdgeFadeDistanceTop
            ),
        },
        right: {
            width: resolveMarkProperty(mark, props.viewportEdgeFadeWidthRight),
            distance: resolveMarkProperty(
                mark,
                props.viewportEdgeFadeDistanceRight
            ),
        },
        bottom: {
            width: resolveMarkProperty(mark, props.viewportEdgeFadeWidthBottom),
            distance: resolveMarkProperty(
                mark,
                props.viewportEdgeFadeDistanceBottom
            ),
        },
        left: {
            width: resolveMarkProperty(mark, props.viewportEdgeFadeWidthLeft),
            distance: resolveMarkProperty(
                mark,
                props.viewportEdgeFadeDistanceLeft
            ),
        },
    };

    const instanceCount = visitTextInstances(
        mark,
        properties,
        {
            coords,
            data,
            visibleBounds,
            anchorCullBounds,
            fontMeasurement,
            measureLogoInkBounds,
        },
        (instance) => {
            if (options.countOnly) {
                return;
            }
            if (instance.logoTransform) {
                if (instance.multiCharacterLogo) {
                    options.warn(
                        "SVG export stretches multi-character logo text as a single glyph cell."
                    );
                }
                const transforms = [
                    `translate(${formatSvgNumber(instance.x)} ${formatSvgNumber(instance.y)})`,
                ];
                if (instance.angle) {
                    transforms.push(
                        `rotate(${formatSvgNumber(instance.angle)})`
                    );
                }
                if (instance.dx || instance.dy) {
                    transforms.push(
                        `translate(${formatSvgNumber(instance.dx)} ${formatSvgNumber(instance.dy)})`
                    );
                }
                transforms.push(
                    `scale(${formatSvgNumber(instance.logoTransform.scaleX)} ${formatSvgNumber(instance.logoTransform.scaleY)})`
                );
                transforms.push(
                    `translate(${formatSvgNumber(-instance.logoTransform.originX)} ${formatSvgNumber(-instance.logoTransform.originY)})`
                );
                const text = createSvgElement("text", {
                    x: 0,
                    y: 0,
                    "text-anchor": "start",
                    transform: transforms.join(" "),
                    ...encodeStyles(instance.datum),
                    "font-size": instance.size,
                });
                text.textContent = instance.text;
                group.appendChild(text);
                return;
            }

            const transforms = [
                `translate(${formatSvgNumber(instance.x)} ${formatSvgNumber(instance.y)})`,
            ];
            if (instance.angle) {
                transforms.push(`rotate(${formatSvgNumber(instance.angle)})`);
            }
            if (instance.dx || instance.dy) {
                transforms.push(
                    `translate(${formatSvgNumber(instance.dx)} ${formatSvgNumber(instance.dy)})`
                );
            }
            if (instance.scale != 1) {
                transforms.push(`scale(${formatSvgNumber(instance.scale)})`);
            }
            const text = createSvgElement("text", {
                x: 0,
                y: 0,
                dy: formatSvgNumber(
                    getNativeBaselineOffset(properties.baseline, instance.size)
                ),
                ...encodeStyles(instance.datum),
                ...(instance.fadeOpacity == 1
                    ? {}
                    : { opacity: formatSvgUnitless(instance.fadeOpacity) }),
                transform: transforms.join(" "),
            });
            text.textContent = instance.text;
            group.appendChild(text);
        }
    );

    if (!options.countOnly && group.childElementCount > 0) {
        const edgeFadeMaskUrl = options.getViewportEdgeFadeMaskUrl(edgeFade);
        if (edgeFadeMaskUrl) {
            group.setAttribute("mask", edgeFadeMaskUrl);
        }
    }
    return instanceCount;
}

const textAnchors = { left: "start", center: "middle", right: "end" };
