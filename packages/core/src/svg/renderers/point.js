import { createSvgElement } from "../svgElement.js";
import { intersectsSvgBounds, isOutsideSvgBounds } from "../svgBounds.js";
import {
    createSvgAttributeEncoder,
    encodeNumber,
    encodePosition,
    encodeString,
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
export function renderPointSvg(baseMark, options) {
    const mark = /** @type {import("../../marks/point.js").default} */ (
        baseMark
    );
    const fillGradientStrength = resolveSvgProperty(
        mark,
        mark.properties.fillGradientStrength
    );
    if (fillGradientStrength) {
        options.warn(
            "SVG export ignored unsupported point property fillGradientStrength."
        );
    }
    if (mark.properties.geometricZoomBound) {
        options.warn(
            "SVG export ignored unsupported point property geometricZoomBound."
        );
    }
    const inwardStroke = resolveSvgProperty(mark, mark.properties.inwardStroke);

    const {
        coords,
        data,
        group,
        viewOpacity,
        visibleBounds,
        anchorCullBounds,
    } = options;
    const encoders =
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const semanticThreshold = mark.getSemanticThreshold();
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
        const shape = encodeString(encoders.shape, datum);
        if (encodeNumber(encoders.semanticScore, datum) < semanticThreshold) {
            continue;
        }

        const x = projectX(
            coords,
            encodePosition(encoders.x, datum),
            encodeNumber(encoders.xOffset, datum) +
                encodeNumber(encoders.dx, datum)
        );
        const y = projectY(
            coords,
            encodePosition(encoders.y, datum),
            encodeNumber(encoders.yOffset, datum) -
                encodeNumber(encoders.dy, datum)
        );
        if (isOutsideSvgBounds(anchorCullBounds, x, y)) {
            continue;
        }
        const radius = Math.sqrt(encodeNumber(encoders.size, datum)) / 2;
        if (inwardStroke && radius <= 0) {
            continue;
        }
        const angle = encodeNumber(encoders.angle, datum);
        const strokeWidth = encodeNumber(encoders.strokeWidth, datum);
        const lineShape = shape == "x" || shape == "+";
        // SVG strokes are centered on the geometry. Shrinking the path
        // diameter by the stroke width keeps the outer diameter unchanged.
        // Once the stroke consumes the whole fill, cap it at the radius to
        // avoid negative or degenerate geometry. This is exact for circles
        // and a close approximation for the other filled symbols.
        const adjustedStrokeWidth =
            inwardStroke && !lineShape
                ? Math.min(strokeWidth, radius)
                : strokeWidth;
        const geometryRadius =
            inwardStroke && !lineShape
                ? radius - adjustedStrokeWidth / 2
                : radius;
        const strokePadding = inwardStroke ? 0 : strokeWidth / 2;
        const conservativeRadius = radius * Math.SQRT2 + strokePadding;
        if (
            !intersectsSvgBounds(
                visibleBounds,
                x - conservativeRadius,
                y - conservativeRadius,
                x + conservativeRadius,
                y + conservativeRadius
            )
        ) {
            continue;
        }
        const styles = {
            ...encodeStyles(datum),
            ...(inwardStroke && !lineShape
                ? { "stroke-width": formatSvgNumber(adjustedStrokeWidth) }
                : {}),
            ...(lineShape
                ? getLineShapeStyles(encoders, datum, viewOpacity)
                : {}),
        };
        const element = createPointElement(shape, x, y, geometryRadius, styles);
        if (!element) {
            options.warn(
                `SVG export rendered unsupported point shape "${shape}" as a circle.`
            );
            group.appendChild(
                createSvgElement("circle", {
                    cx: formatSvgNumber(x),
                    cy: formatSvgNumber(y),
                    r: formatSvgNumber(geometryRadius),
                    ...styles,
                })
            );
        } else {
            if (angle) {
                element.setAttribute(
                    "transform",
                    `rotate(${formatSvgNumber(angle)} ${formatSvgNumber(x)} ${formatSvgNumber(y)})`
                );
            }
            group.appendChild(element);
        }
    }
}

/**
 * @param {string} shape
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @param {Record<string, string | number>} styles
 * @returns {SVGElement | undefined}
 */
function createPointElement(shape, x, y, radius, styles) {
    const cx = formatSvgNumber(x);
    const cy = formatSvgNumber(y);
    const r = formatSvgNumber(radius);

    if (shape == "circle") {
        return createSvgElement("circle", { cx, cy, r, ...styles });
    } else if (shape == "square") {
        return createSvgElement("rect", {
            x: formatSvgNumber(x - radius),
            y: formatSvgNumber(y - radius),
            width: formatSvgNumber(radius * 2),
            height: formatSvgNumber(radius * 2),
            ...styles,
        });
    }

    const path = getPointPath(shape, x, y, radius);
    return path ? createSvgElement("path", { d: path, ...styles }) : undefined;
}

/**
 * @param {string} shape
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @returns {string | undefined}
 */
function getPointPath(shape, x, y, radius) {
    const p = (/** @type {[number, number]} */ point) =>
        point.map(formatSvgNumber).join(" ");
    const polygon = (/** @type {[number, number][]} */ points) =>
        `M ${points.map(p).join(" L ")} Z`;
    const arm = radius * 0.4;
    const tickHalfWidth = radius * 0.15;
    const triangleHeight = (Math.sqrt(3) * radius) / 2;

    if (shape == "diamond") {
        return polygon([
            [x, y - radius],
            [x + radius, y],
            [x, y + radius],
            [x - radius, y],
        ]);
    } else if (shape == "cross") {
        return polygon([
            [x - arm, y - radius],
            [x + arm, y - radius],
            [x + arm, y - arm],
            [x + radius, y - arm],
            [x + radius, y + arm],
            [x + arm, y + arm],
            [x + arm, y + radius],
            [x - arm, y + radius],
            [x - arm, y + arm],
            [x - radius, y + arm],
            [x - radius, y - arm],
            [x - arm, y - arm],
        ]);
    } else if (shape.startsWith("triangle-")) {
        const points = {
            "triangle-up": [
                [x, y - triangleHeight],
                [x + radius, y + triangleHeight],
                [x - radius, y + triangleHeight],
            ],
            "triangle-right": [
                [x + triangleHeight, y],
                [x - triangleHeight, y + radius],
                [x - triangleHeight, y - radius],
            ],
            "triangle-down": [
                [x, y + triangleHeight],
                [x - radius, y - triangleHeight],
                [x + radius, y - triangleHeight],
            ],
            "triangle-left": [
                [x - triangleHeight, y],
                [x + triangleHeight, y - radius],
                [x + triangleHeight, y + radius],
            ],
        }[shape];
        return points
            ? polygon(/** @type {[number, number][]} */ (points))
            : undefined;
    } else if (shape.startsWith("tick-")) {
        const widths = {
            "tick-up": [-tickHalfWidth, -radius, tickHalfWidth, 0],
            "tick-right": [0, -tickHalfWidth, radius, tickHalfWidth],
            "tick-down": [-tickHalfWidth, 0, tickHalfWidth, radius],
            "tick-left": [-radius, -tickHalfWidth, 0, tickHalfWidth],
        }[shape];
        if (widths) {
            const [x1, y1, x2, y2] = widths;
            return polygon([
                [x + x1, y + y1],
                [x + x2, y + y1],
                [x + x2, y + y2],
                [x + x1, y + y2],
            ]);
        }
    } else if (shape == "+") {
        return `M ${p([x - radius, y])} L ${p([x + radius, y])} M ${p([x, y - radius])} L ${p([x, y + radius])}`;
    } else if (shape == "x") {
        return `M ${p([x - radius, y - radius])} L ${p([x + radius, y + radius])} M ${p([x + radius, y - radius])} L ${p([x - radius, y + radius])}`;
    }
}

/**
 * @param {Record<string, import("../../types/encoder.js").Encoder>} encoders
 * @param {object} datum
 * @param {number} viewOpacity
 * @returns {Record<string, string | number>}
 */
function getLineShapeStyles(encoders, datum, viewOpacity) {
    const stroke = encoders.stroke(datum);
    const strokeOpacity = encodeNumber(encoders.strokeOpacity, datum);
    const useFill = stroke == null || strokeOpacity <= 0;
    return {
        fill: "none",
        stroke: toSvgString(useFill ? encoders.fill(datum) : stroke),
        "stroke-opacity":
            (useFill
                ? encodeNumber(encoders.fillOpacity, datum)
                : strokeOpacity) * viewOpacity,
        "stroke-width": formatSvgNumber(
            encodeNumber(encoders.strokeWidth, datum)
        ),
        "stroke-linecap": "butt",
    };
}
