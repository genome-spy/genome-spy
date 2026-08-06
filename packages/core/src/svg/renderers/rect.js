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
export function renderRectSvg(baseMark, options) {
    const mark = /** @type {import("../../marks/rect.js").default} */ (
        baseMark
    );
    const p = mark.properties;
    const rounded =
        p.cornerRadius ||
        p.cornerRadiusBottomLeft ||
        p.cornerRadiusBottomRight ||
        p.cornerRadiusTopLeft ||
        p.cornerRadiusTopRight;
    if (rounded || (p.hatch ?? "none") != "none" || p.shadowOpacity) {
        options.warn(
            "SVG export ignored unsupported rounded, hatched, or shadowed rectangle properties."
        );
    }

    const { coords, data, group, viewOpacity } = options;
    const encoders =
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const encodeStyles = createSvgAttributeEncoder(group, {
        fill: { encoder: encoders.fill, transform: toSvgString },
        "fill-opacity": {
            encoder: encoders.fillOpacity,
            transform: (value) => +value * viewOpacity,
        },
        stroke: { encoder: encoders.stroke, transform: toSvgString },
        "stroke-opacity": {
            encoder: encoders.strokeOpacity,
            transform: (value) => +value * viewOpacity,
        },
        "stroke-width": {
            encoder: encoders.strokeWidth,
            transform: (value) => formatSvgNumber(+value),
        },
    });

    for (const datum of data) {
        const xOffset = encodeNumber(encoders.xOffset, datum);
        const yOffset = encodeNumber(encoders.yOffset, datum);
        const x2Offset = encoders.x2Offset
            ? encodeNumber(encoders.x2Offset, datum)
            : xOffset;
        const y2Offset = encoders.y2Offset
            ? encodeNumber(encoders.y2Offset, datum)
            : yOffset;
        const x1 = projectX(coords, encodePosition(encoders.x, datum), xOffset);
        const x2 = projectX(
            coords,
            encodePosition(encoders.x2, datum),
            x2Offset
        );
        const y1 = projectY(coords, encodePosition(encoders.y, datum), yOffset);
        const y2 = projectY(
            coords,
            encodePosition(encoders.y2, datum),
            y2Offset
        );
        group.appendChild(
            createSvgElement("rect", {
                x: formatSvgNumber(Math.min(x1, x2)),
                y: formatSvgNumber(Math.min(y1, y2)),
                width: formatSvgNumber(Math.abs(x2 - x1)),
                height: formatSvgNumber(Math.abs(y2 - y1)),
                ...encodeStyles(datum),
            })
        );
    }
}
