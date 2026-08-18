import {
    normalizeFontWeight,
    resolveTextProperties,
    visitTextInstances,
} from "../../rendering/cpu/text.js";
import { createSvgElement } from "../svgElement.js";
import {
    createSvgAttributeEncoder,
    formatSvgNumber,
    resolveSvgProperty,
    toSvgString,
} from "../svgMarkUtils.js";
import { formatSvgUnitless } from "../svgNumber.js";

const SVG_FONT_FALLBACKS = [
    "Lato",
    "Avenir Next",
    "Avenir",
    "Segoe UI",
    "Ubuntu",
    "Noto Sans",
    "Helvetica Neue",
    "Helvetica",
    "Arial",
    "sans-serif",
];

/**
 * @param {import("../../marks/mark.js").default} baseMark
 * @param {import("../svgViewRenderingContext.js").SvgMarkRenderingOptions} options
 */
export function renderTextSvg(baseMark, options) {
    const mark = /** @type {import("../../marks/text.js").default} */ (
        baseMark
    );
    const props = mark.properties;
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
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const encodeStyles = createSvgAttributeEncoder(group, {
        fill: { encoder: encoders.color, transform: toSvgString },
        "fill-opacity": {
            encoder: encoders.opacity,
            transform: (value) => +value * viewOpacity,
        },
        "font-size": {
            encoder: encoders.size,
            transform: (value) => formatSvgNumber(+value),
        },
    });
    group.setAttribute("font-family", createSvgFontFamily(props.font));
    group.setAttribute("font-style", props.fontStyle ?? "normal");
    group.setAttribute(
        "font-weight",
        "" + normalizeFontWeight(props.fontWeight ?? "normal")
    );
    group.setAttribute("text-anchor", textAnchors[props.align]);

    const edgeFade = {
        top: {
            width: resolveSvgProperty(mark, props.viewportEdgeFadeWidthTop),
            distance: resolveSvgProperty(
                mark,
                props.viewportEdgeFadeDistanceTop
            ),
        },
        right: {
            width: resolveSvgProperty(mark, props.viewportEdgeFadeWidthRight),
            distance: resolveSvgProperty(
                mark,
                props.viewportEdgeFadeDistanceRight
            ),
        },
        bottom: {
            width: resolveSvgProperty(mark, props.viewportEdgeFadeWidthBottom),
            distance: resolveSvgProperty(
                mark,
                props.viewportEdgeFadeDistanceBottom
            ),
        },
        left: {
            width: resolveSvgProperty(mark, props.viewportEdgeFadeWidthLeft),
            distance: resolveSvgProperty(
                mark,
                props.viewportEdgeFadeDistanceLeft
            ),
        },
    };

    const instanceCount = visitTextInstances(
        mark,
        properties,
        { coords, data, visibleBounds, anchorCullBounds },
        (instance) => {
            if (options.countOnly) {
                return;
            }
            if (instance.logoScale) {
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
                    `scale(${formatSvgNumber(instance.logoScale.width)} ${formatSvgNumber(instance.logoScale.heightScale)})`
                );
                const text = createSvgElement("text", {
                    x: 0,
                    y: 0,
                    dy: getBaselineOffset("middle", 1),
                    "text-anchor": "middle",
                    lengthAdjust: "spacingAndGlyphs",
                    textLength: 1,
                    transform: transforms.join(" "),
                    ...encodeStyles(instance.datum),
                    "font-size": 1,
                });
                text.textContent = instance.text;
                group.appendChild(text);
                return;
            }

            const svgX = formatSvgNumber(instance.x);
            const svgY = formatSvgNumber(instance.y);
            const text = createSvgElement("text", {
                x: svgX,
                y: svgY,
                dx: formatSvgNumber(instance.dx),
                dy: formatSvgNumber(
                    instance.dy +
                        getBaselineOffset(props.baseline, instance.size)
                ),
                lengthAdjust: "spacingAndGlyphs",
                textLength: formatSvgNumber(instance.width),
                ...encodeStyles(instance.datum),
                ...(instance.scale == 1
                    ? {}
                    : { "font-size": formatSvgNumber(instance.size) }),
                ...(instance.fadeOpacity == 1
                    ? {}
                    : { opacity: formatSvgUnitless(instance.fadeOpacity) }),
            });
            text.textContent = instance.text;
            if (instance.angle) {
                text.setAttribute(
                    "transform",
                    `rotate(${formatSvgNumber(instance.angle)} ${svgX} ${svgY})`
                );
            }
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

/** @param {string | undefined} font */
function createSvgFontFamily(font) {
    const preferredFont = font ?? "Lato";
    return [
        preferredFont,
        ...SVG_FONT_FALLBACKS.filter(
            (fallback) => fallback.toLowerCase() != preferredFont.toLowerCase()
        ),
    ]
        .map(formatFontFamily)
        .join(", ");
}

/** @param {string} family */
function formatFontFamily(family) {
    return family == "sans-serif"
        ? family
        : `'${family.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

const textAnchors = { left: "start", center: "middle", right: "end" };

/**
 * @param {"top" | "middle" | "bottom" | "alphabetic" | "baseline"} baseline
 * @param {number} fontSize
 */
function getBaselineOffset(baseline, fontSize) {
    switch (baseline) {
        case "top":
            return 0.79 * fontSize;
        case "middle":
            return 0.35 * fontSize;
        case "bottom":
            return -0.21 * fontSize;
        case "alphabetic":
        case "baseline":
            return 0;
        default:
            throw new Error(`Unknown text baseline: ${baseline}`);
    }
}
