import { createSvgElement } from "./svgElement.js";
import { formatSvgNumber } from "./svgNumber.js";

import { createFadeStops } from "../immediate/linkFading.js";

/**
 * Creates a view-wide mask whose opacity follows the shader's smoothstep fade
 * as a function of perpendicular distance from the chord.
 *
 * @param {string} id
 * @param {number} width
 * @param {number} height
 * @param {import("../immediate/linkFading.js").NormalizedLinkArcFade} fade
 */
export function createLinkArcFadeMask(id, width, height, fade) {
    const { normalX, normalY, offset, start, end } = fade;
    const baseX = normalX * offset;
    const baseY = normalY * offset;
    const gradientId = id + "-gradient";
    const gradient = createSvgElement("linearGradient", {
        id: gradientId,
        gradientUnits: "userSpaceOnUse",
        x1: formatSvgNumber(baseX - normalX * end),
        y1: formatSvgNumber(baseY - normalY * end),
        x2: formatSvgNumber(baseX + normalX * end),
        y2: formatSvgNumber(baseY + normalY * end),
        spreadMethod: "pad",
    });

    for (const { offset, opacity } of createFadeStops(start, end)) {
        gradient.appendChild(
            createSvgElement("stop", {
                // Gradient offsets and opacity are unitless; retain more
                // precision than CSS-pixel geometry.
                offset: round(offset, 3),
                "stop-color": "white",
                "stop-opacity": round(opacity, 3),
            })
        );
    }

    const mask = createSvgElement("mask", {
        id,
        x: 0,
        y: 0,
        width: formatSvgNumber(width),
        height: formatSvgNumber(height),
        maskUnits: "userSpaceOnUse",
        maskContentUnits: "userSpaceOnUse",
        "mask-type": "luminance",
    });
    mask.appendChild(
        createSvgElement("rect", {
            width: formatSvgNumber(width),
            height: formatSvgNumber(height),
            fill: `url(#${gradientId})`,
        })
    );

    return { gradient, mask };
}

/** @param {number} value @param {number} digits */
function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}
