import { createSvgElement } from "./svgElement.js";
import { formatSvgNumber } from "./svgNumber.js";

/**
 * Creates a screen-aligned paint server that mirrors the rect shader's hatch
 * spacing. The background and hatch foreground live in the pattern so their
 * independent fill and stroke opacities are preserved by one SVG fill paint.
 *
 * @param {string} id
 * @param {import("./svgViewRenderingContext.js").SvgRectHatch} hatch
 * @returns {SVGPatternElement}
 */
export function createRectHatchPattern(id, hatch) {
    const strokeWidth = hatch.strokeWidth;
    const circular = ["dots", "rings", "ringsLarge"].includes(hatch.type);
    const diagonal = ["diagonal", "antiDiagonal", "cross"].includes(hatch.type);
    const axial = ["vertical", "horizontal", "grid"].includes(hatch.type);
    const spacing = circular
        ? strokeWidth * 7
        : strokeWidth * (diagonal ? 6 : 4);
    // verticalPattern() and horizontalPattern() divide the axis distance by
    // two in the shader, making their visible band twice the nominal stroke.
    const patternStrokeWidth = axial ? strokeWidth * 2 : strokeWidth;
    const width = spacing;
    const height = circular ? spacing * 2 : spacing;
    const pattern = createSvgElement("pattern", {
        id,
        x: 0,
        y: 0,
        width: formatSvgNumber(width),
        height: formatSvgNumber(height),
        patternUnits: "userSpaceOnUse",
    });
    pattern.appendChild(
        createSvgElement("rect", {
            width: formatSvgNumber(width),
            height: formatSvgNumber(height),
            fill: hatch.fill,
            "fill-opacity": formatSvgNumber(hatch.fillOpacity),
        })
    );

    const foreground = createSvgElement("g", {
        fill: "none",
        stroke: hatch.stroke,
        "stroke-opacity": formatSvgNumber(hatch.strokeOpacity),
        "stroke-width": formatSvgNumber(patternStrokeWidth),
        "stroke-linecap": "square",
    });
    appendHatchGeometry(foreground, hatch.type, spacing, patternStrokeWidth);
    pattern.appendChild(foreground);
    return pattern;
}

/**
 * @param {SVGGElement} group
 * @param {string} type
 * @param {number} spacing
 * @param {number} strokeWidth
 */
function appendHatchGeometry(group, type, spacing, strokeWidth) {
    const line = (/** @type {string} */ d) =>
        group.appendChild(createSvgElement("path", { d }));
    const point = (/** @type {number} */ value) => formatSvgNumber(value);
    const diagonal = (/** @type {boolean} */ downward) => {
        // SVG screen coordinates grow downward. The shader's "diagonal"
        // pattern therefore runs from top-left to bottom-right. Extend each
        // segment beyond the tile so rasterizers cannot expose antialiased
        // gaps where neighboring pattern cells meet.
        for (const offset of [-spacing, 0, spacing]) {
            line(
                `M ${point(offset - strokeWidth)} ${point(downward ? -strokeWidth : spacing + strokeWidth)} L ${point(offset + spacing + strokeWidth)} ${point(downward ? spacing + strokeWidth : -strokeWidth)}`
            );
        }
    };

    switch (type) {
        case "diagonal":
            diagonal(true);
            break;
        case "antiDiagonal":
            diagonal(false);
            break;
        case "cross":
            diagonal(true);
            diagonal(false);
            break;
        case "vertical":
            line(
                `M 0 ${point(-strokeWidth)} V ${point(spacing + strokeWidth)}`
            );
            break;
        case "horizontal":
            line(
                `M ${point(-strokeWidth)} 0 H ${point(spacing + strokeWidth)}`
            );
            break;
        case "grid":
            line(
                `M 0 ${point(-strokeWidth)} V ${point(spacing + strokeWidth)} M ${point(-strokeWidth)} 0 H ${point(spacing + strokeWidth)}`
            );
            break;
        case "dots":
        case "rings":
        case "ringsLarge": {
            const radiusFactor =
                type == "dots" ? 0.07 : type == "rings" ? 0.2 : 0.35;
            const radius = spacing * radiusFactor;
            const circle = (/** @type {number} */ x, /** @type {number} */ y) =>
                group.appendChild(
                    createSvgElement("circle", {
                        cx: formatSvgNumber(x),
                        cy: formatSvgNumber(y),
                        r: formatSvgNumber(radius),
                    })
                );

            // The shader uses a masonry lattice with centers on alternating
            // tile boundaries. SVG clips pattern cells, so each boundary
            // circle needs a copy on the opposite edge to supply its other
            // half from the neighboring tile.
            circle(spacing / 2, 0);
            circle(spacing / 2, spacing * 2);
            circle(0, spacing);
            circle(spacing, spacing);
            break;
        }
        default:
            throw new Error(`Unknown rectangle hatch pattern: ${type}`);
    }
}
