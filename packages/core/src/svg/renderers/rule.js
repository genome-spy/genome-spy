import { createSvgElement } from "../svgElement.js";
import { intersectsSvgBounds } from "../svgBounds.js";
import {
    createSvgAttributeEncoder,
    encodeNumber,
    encodePosition,
    formatSvgNumber,
    projectX,
    projectY,
    resolveSvgProperty,
    toSvgString,
} from "../svgMarkUtils.js";

/**
 * @param {import("../../marks/mark.js").default} baseMark
 * @param {import("../svgViewRenderingContext.js").SvgMarkRenderingOptions} options
 */
export function renderRuleSvg(baseMark, options) {
    const mark = /** @type {import("../../marks/rule.js").default} */ (
        baseMark
    );
    const minLength = resolveSvgProperty(mark, mark.properties.minLength);
    const { coords, data, group, viewOpacity, visibleBounds } = options;
    const encoders =
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const strokeDash = mark.properties.strokeDash;
    const encodeStyles = createSvgAttributeEncoder(group, {
        stroke: { encoder: encoders.color, transform: toSvgString },
        "stroke-opacity": {
            encoder: encoders.opacity,
            transform: (value) => +value * viewOpacity,
        },
        "stroke-width": {
            encoder: encoders.size,
            transform: (value) => formatSvgNumber(+value),
        },
    });
    group.setAttribute("stroke-linecap", "" + mark.properties.strokeCap);
    if (strokeDash) {
        group.setAttribute(
            "stroke-dasharray",
            strokeDash.map(formatSvgNumber).join(" ")
        );
        group.setAttribute(
            "stroke-dashoffset",
            "" + formatSvgNumber(mark.properties.strokeDashOffset)
        );
    }

    for (const datum of data) {
        const xOffset = encodeNumber(encoders.xOffset, datum);
        const yOffset = encodeNumber(encoders.yOffset, datum);
        const x2Offset = encoders.x2Offset
            ? encodeNumber(encoders.x2Offset, datum)
            : xOffset;
        const y2Offset = encoders.y2Offset
            ? encodeNumber(encoders.y2Offset, datum)
            : yOffset;
        let x1 = projectX(coords, encodePosition(encoders.x, datum), xOffset);
        let y1 = projectY(coords, encodePosition(encoders.y, datum), yOffset);
        let x2 = projectX(coords, encodePosition(encoders.x2, datum), x2Offset);
        let y2 = projectY(coords, encodePosition(encoders.y2, datum), y2Offset);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.hypot(dx, dy);
        if (length > 0 && length < minLength) {
            const expansion = (minLength - length) / 2;
            const ux = dx / length;
            const uy = dy / length;
            x1 -= ux * expansion;
            y1 -= uy * expansion;
            x2 += ux * expansion;
            y2 += uy * expansion;
        }
        const strokePadding = encodeNumber(encoders.size, datum) / 2;
        if (
            !intersectsSvgBounds(visibleBounds, x1, y1, x2, y2, strokePadding)
        ) {
            continue;
        }
        group.appendChild(
            createSvgElement("line", {
                x1: formatSvgNumber(x1),
                y1: formatSvgNumber(y1),
                x2: formatSvgNumber(x2),
                y2: formatSvgNumber(y2),
                ...encodeStyles(datum),
            })
        );
    }
}
