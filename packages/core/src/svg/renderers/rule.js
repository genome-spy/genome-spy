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
export function renderRuleSvg(baseMark, options) {
    const mark = /** @type {import("../../marks/rule.js").default} */ (
        baseMark
    );
    const { coords, data, group, viewOpacity } = options;
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
        group.appendChild(
            createSvgElement("line", {
                x1: formatSvgNumber(
                    projectX(coords, encodePosition(encoders.x, datum), xOffset)
                ),
                y1: formatSvgNumber(
                    projectY(coords, encodePosition(encoders.y, datum), yOffset)
                ),
                x2: formatSvgNumber(
                    projectX(
                        coords,
                        encodePosition(encoders.x2, datum),
                        x2Offset
                    )
                ),
                y2: formatSvgNumber(
                    projectY(
                        coords,
                        encodePosition(encoders.y2, datum),
                        y2Offset
                    )
                ),
                ...encodeStyles(datum),
            })
        );
    }
}
