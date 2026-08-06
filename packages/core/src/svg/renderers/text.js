import { format } from "d3-format";
import { isString } from "vega-util";
import { createSvgElement } from "../svgElement.js";
import {
    createSvgAttributeEncoder,
    encodeNumber,
    encodePosition,
    formatSvgNumber,
    projectX,
    projectY,
    toSvgString,
} from "../svgMarkUtils.js";

/**
 * @param {import("../../marks/mark.js").default} baseMark
 * @param {import("../svgViewRenderingContext.js").SvgMarkRenderingOptions} options
 */
export function renderTextSvg(baseMark, options) {
    const mark = /** @type {import("../../marks/text.js").default} */ (
        baseMark
    );
    if (mark.properties.logoLetters || mark.properties.fitToBand) {
        options.warn(
            "SVG export ignored unsupported fitted or logo-letter text properties."
        );
    }

    const { coords, data, group, viewOpacity } = options;
    const encoders =
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const channelDef = mark.encoding.text;
    const numberFormat =
        "format" in channelDef
            ? format(channelDef.format)
            : (/** @type {any} */ d) => d;
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
    group.setAttribute("font-family", "sans-serif");
    group.setAttribute("font-style", mark.properties.fontStyle ?? "normal");
    group.setAttribute(
        "font-weight",
        "" + normalizeFontWeight(mark.properties.fontWeight ?? "normal")
    );
    group.setAttribute("text-anchor", textAnchors[mark.properties.align]);
    group.setAttribute(
        "dominant-baseline",
        dominantBaselines[mark.properties.baseline]
    );

    for (const datum of data) {
        const value = numberFormat(encoders.text(datum));
        const stringValue = isString(value)
            ? value
            : value === null
              ? ""
              : "" + value;
        if (!stringValue) {
            continue;
        }

        const x = projectX(
            coords,
            encodePosition(encoders.x, datum),
            encodeNumber(encoders.xOffset, datum)
        );
        const y = projectY(
            coords,
            encodePosition(encoders.y, datum),
            encodeNumber(encoders.yOffset, datum)
        );
        const size = encodeNumber(encoders.size, datum);
        const angle = encodeNumber(encoders.angle, datum);
        const svgX = formatSvgNumber(x);
        const svgY = formatSvgNumber(y);
        const text = createSvgElement("text", {
            x: svgX,
            y: svgY,
            dx: formatSvgNumber(mark.properties.dx),
            dy: formatSvgNumber(mark.properties.dy),
            lengthAdjust: "spacingAndGlyphs",
            textLength: formatSvgNumber(
                mark.font.metrics.measureWidth(stringValue, size)
            ),
            ...encodeStyles(datum),
        });
        text.textContent = stringValue;
        if (angle) {
            text.setAttribute(
                "transform",
                `rotate(${formatSvgNumber(angle)} ${svgX} ${svgY})`
            );
        }
        group.appendChild(text);
    }
}

const textAnchors = {
    left: "start",
    center: "middle",
    right: "end",
};

const dominantBaselines = {
    top: "text-before-edge",
    middle: "central",
    bottom: "text-after-edge",
    alphabetic: "alphabetic",
    baseline: "alphabetic",
};

const fontWeights = {
    thin: 100,
    light: 300,
    regular: 400,
    normal: 400,
    medium: 500,
    bold: 700,
    black: 900,
};

/** @param {string | number} weight */
function normalizeFontWeight(weight) {
    return typeof weight == "number"
        ? weight
        : fontWeights[/** @type {keyof typeof fontWeights} */ (weight)];
}
