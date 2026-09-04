import { createSvgElement } from "../svgElement.js";
import {
    resolveLinkProperties,
    visitLinkInstances,
} from "../../immediate/marks/link.js";
import { toPaintString } from "../../immediate/markEncoding.js";
import { createSvgAttributeEncoder } from "../svgAttributes.js";
import { formatSvgNumber } from "../svgNumber.js";
import { createLinkFadeEncoder } from "../../immediate/linkFading.js";

/**
 * @param {import("../../../marks/mark.js").default} baseMark
 * @param {import("../svgViewRenderingContext.js").SvgMarkRenderingOptions} options
 */
export function renderLinkSvg(baseMark, options) {
    const mark = /** @type {import("../../../marks/link.js").default} */ (
        baseMark
    );
    const properties = resolveLinkProperties(mark);
    const { coords, data, group, viewOpacity, visibleBounds } = options;
    const encoders =
        /** @type {Record<string, import("../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const encodeFade = createLinkFadeEncoder(mark, properties.shape);
    const encodeStyles = createSvgAttributeEncoder(group, {
        stroke: { encoder: encoders.color, transform: toPaintString },
        "stroke-opacity": {
            encoder: encoders.opacity,
            transform: (value) => +value * viewOpacity,
        },
        "stroke-width": {
            encoder: encoders.size,
            transform: (value) => formatSvgNumber(+value),
        },
    });
    group.setAttribute("fill", "none");
    group.setAttribute("stroke-linecap", "butt");
    return visitLinkInstances(
        mark,
        properties,
        { coords, data, visibleBounds },
        ({ datum, points }) => {
            const [p1, p2, p3, p4] = points;
            if (options.countOnly) {
                return;
            }
            /** @type {Record<string, string | number>} */
            const styles = encodeStyles(datum);
            const arcFadingDistance = encodeFade(datum);
            if (arcFadingDistance) {
                const mask = options.getLinkArcFadeMaskUrl({
                    p1: /** @type {[number, number]} */ (p1),
                    p4: /** @type {[number, number]} */ (p4),
                    distances: arcFadingDistance,
                });
                if (mask) {
                    styles.mask = mask;
                }
            }
            group.appendChild(
                createSvgElement("path", {
                    d: `M ${formatSvgPoint(p1)} C ${formatSvgPoint(p2)} ${formatSvgPoint(p3)} ${formatSvgPoint(p4)}`,
                    ...styles,
                })
            );
        }
    );
}

/** @param {number[]} point */
function formatSvgPoint(point) {
    return point.map(formatSvgNumber).join(" ");
}
