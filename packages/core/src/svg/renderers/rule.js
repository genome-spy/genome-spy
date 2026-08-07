import { createSvgElement } from "../svgElement.js";
import { intersectsSvgBounds } from "../svgBounds.js";
import {
    createSvgAttributeEncoder,
    encodeNumber,
    formatSvgNumber,
    projectXRange,
    projectYRange,
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
    let instanceCount = 0;

    for (const datum of data) {
        let [x1, x2] = projectXRange(coords, encoders, datum);
        let [y1, y2] = projectYRange(coords, encoders, datum);
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
        instanceCount++;
        if (options.countOnly) {
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
    return instanceCount;
}
