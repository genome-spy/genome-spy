import { createSvgElement } from "./svgElement.js";
import { formatSvgNumber } from "./svgNumber.js";

const FADE_STEPS = 4;

/**
 * @typedef {object} NormalizedLinkArcFade
 * @prop {number} normalX
 * @prop {number} normalY
 * @prop {number} offset
 * @prop {number} start
 * @prop {number} end
 * @prop {string} key
 */

/**
 * Canonicalizes the infinite chord line so collinear links share one mask
 * regardless of endpoint order or arc height.
 *
 * @param {[number, number]} p1
 * @param {[number, number]} p4
 * @param {[number, number]} distances
 * @returns {NormalizedLinkArcFade | undefined}
 */
export function normalizeLinkArcFade(p1, p4, distances) {
    const dx = p4[0] - p1[0];
    const dy = p4[1] - p1[1];
    const length = Math.hypot(dx, dy);
    if (length == 0) {
        return undefined;
    }

    let normalX = -dy / length;
    let normalY = dx / length;
    if (normalX < 0 || (normalX == 0 && normalY < 0)) {
        normalX = -normalX;
        normalY = -normalY;
    }
    const offset = normalX * p1[0] + normalY * p1[1];
    const [start, end] = distances;
    const key = JSON.stringify([
        round(normalX, 6),
        round(normalY, 6),
        round(offset, 1),
        round(start, 1),
        round(end, 1),
    ]);

    return { normalX, normalY, offset, start, end, key };
}

/**
 * Creates a view-wide mask whose opacity follows the shader's smoothstep fade
 * as a function of perpendicular distance from the chord.
 *
 * @param {string} id
 * @param {number} width
 * @param {number} height
 * @param {NormalizedLinkArcFade} fade
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

/**
 * @param {number} start
 * @param {number} end
 */
function createFadeStops(start, end) {
    /** @type {{offset: number, opacity: number}[]} */
    const stops = [];
    const appendSide = (/** @type {boolean} */ left) => {
        for (let i = 0; i <= FADE_STEPS; i++) {
            const t = i / FADE_STEPS;
            const distance = left
                ? end + (start - end) * t
                : start + (end - start) * t;
            const position = left
                ? (end - distance) / (2 * end)
                : (end + distance) / (2 * end);
            const fadeT = (distance - start) / (end - start);
            stops.push({
                offset: position,
                opacity: 1 - smoothstep(fadeT),
            });
        }
    };

    appendSide(true);
    appendSide(false);
    return stops;
}

/** @param {number} value */
function smoothstep(value) {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
}

/** @param {number} value @param {number} digits */
function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}
