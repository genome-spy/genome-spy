import { createSvgElement } from "../svgElement.js";
import {
    resolveLinkProperties,
    visitLinkInstances,
} from "../../immediate/marks/link.js";
import { encodeNumber, toPaintString } from "../../immediate/markEncoding.js";
import { createSvgAttributeEncoder } from "../svgAttributes.js";
import { formatSvgNumber } from "../svgNumber.js";
import { resolveLinkFade } from "../../immediate/linkFading.js";

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
    const arcFadingDistance = resolveLinkFade(
        mark,
        properties.shape,
        options.secondOrderPass
    );
    // SVG has no intrinsic DPR. Assume 2 so thin links remain smooth at native size.
    const pixelSize = 0.5;
    const constantOpacity = encoders.opacity.constant && encoders.size.constant;
    const encodeOpacity = (/** @type {object} */ datum) =>
        encodeNumber(encoders.opacity, datum) *
        viewOpacity *
        Math.max(
            0,
            Math.min(encodeNumber(encoders.size, datum) / pixelSize, 1)
        );
    if (constantOpacity) {
        group.setAttribute("stroke-opacity", "" + encodeOpacity({}));
    }

    const encodeStyles = createSvgAttributeEncoder(group, {
        stroke: { encoder: encoders.color, transform: toPaintString },
        "stroke-width": {
            encoder: encoders.size,
            transform: (value) => formatSvgNumber(Math.max(+value, pixelSize)),
        },
    });
    group.setAttribute("fill", "none");
    group.setAttribute("stroke-linecap", "butt");
    /** @type {SVGGElement} */
    let pathGroup = group;

    /** @type {string | undefined} */
    let currentMask;
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
            if (!constantOpacity) {
                styles["stroke-opacity"] = encodeOpacity(datum);
            }
            const mask = arcFadingDistance
                ? options.getLinkArcFadeMaskUrl({
                      p1: /** @type {[number, number]} */ (p1),
                      p4: /** @type {[number, number]} */ (p4),
                      distances: arcFadingDistance,
                  })
                : undefined;
            if (mask !== currentMask) {
                currentMask = mask;
                pathGroup = mask ? createSvgElement("g", { mask }) : group;
                if (mask) {
                    group.appendChild(pathGroup);
                }
            }
            pathGroup.appendChild(
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
