import { createSvgElement } from "../svgElement.js";
import { intersectsSvgBounds } from "../svgBounds.js";
import { unionPolygons } from "../polygonUnion.js";
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
export function renderArrowSvg(baseMark, options) {
    const mark = /** @type {import("../../marks/arrow.js").default} */ (
        baseMark
    );
    const props = mark.properties;
    const configuredRHeadSlope = reciprocalSlope(
        resolveSvgProperty(mark, props.headAngle)
    );
    const configuredRHeadNotchSlope = reciprocalSlope(
        resolveSvgProperty(mark, props.headNotchAngle)
    );
    const headShape = resolveSvgProperty(mark, props.headShape);
    const headWidth = resolveSvgProperty(mark, props.headWidth);
    const minSize = resolveSvgProperty(mark, props.minSize);
    const stem = resolveSvgProperty(mark, props.stem);
    const startNotch = resolveSvgProperty(mark, props.startNotch);
    const minStemLength = resolveSvgProperty(mark, props.minStemLength);
    const headSpacing = resolveSvgProperty(mark, props.headSpacing);
    const repeatHeads = headSpacing != null && headSpacing >= 0;
    const headPlacement = resolveSvgProperty(mark, props.headPlacement);

    const { coords, data, group, viewOpacity, visibleBounds } = options;
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
    group.setAttribute("stroke-linejoin", "miter");

    for (const datum of data) {
        const xOffset = encodeNumber(encoders.xOffset, datum);
        const yOffset = encodeNumber(encoders.yOffset, datum);
        const a = {
            x: projectX(coords, encodePosition(encoders.x, datum), xOffset),
            y: projectY(coords, encodePosition(encoders.y, datum), yOffset),
        };
        const b = {
            x: projectX(
                coords,
                encodePosition(encoders.x2, datum),
                encoders.x2Offset
                    ? encodeNumber(encoders.x2Offset, datum)
                    : xOffset
            ),
            y: projectY(
                coords,
                encodePosition(encoders.y2, datum),
                encoders.y2Offset
                    ? encodeNumber(encoders.y2Offset, datum)
                    : yOffset
            ),
        };
        const direction = encodeString(encoders.direction, datum);
        const tail = direction == "reverse" ? b : a;
        const endpoint = direction == "reverse" ? a : b;
        const segment = subtract(endpoint, tail);
        const segmentLength = Math.hypot(segment.x, segment.y);
        if (segmentLength == 0) {
            continue;
        }

        const tangent = scale(segment, 1 / segmentLength);
        const normal = { x: -tangent.y, y: tangent.x };
        const size = Math.max(encodeNumber(encoders.size, datum), minSize);
        const stemHalfWidth = size / 2;
        const headHalfWidth = Math.max(headWidth * size, 0) / 2;
        const rHeadSlope = effectiveHeadSlope({
            segmentLength,
            headHalfWidth,
            stemHalfWidth: stem ? stemHalfWidth : -stemHalfWidth,
            configuredRHeadSlope,
            configuredRHeadNotchSlope,
            headRepeat: repeatHeads,
            headPlacement,
            startNotch,
            minStemLength,
            headShape,
        });
        const rHeadNotchSlope =
            headShape == "open"
                ? rHeadSlope
                : Math.min(configuredRHeadNotchSlope, rHeadSlope);
        const headStrokeWidth = headShape == "open" ? size : 0;
        const outsideHeadOffset =
            headPlacement == "outside"
                ? headNotchOffset(
                      headHalfWidth,
                      rHeadSlope,
                      rHeadNotchSlope,
                      headStrokeWidth
                  )
                : 0;
        const tip =
            headPlacement == "outside"
                ? add(endpoint, scale(tangent, outsideHeadOffset))
                : endpoint;
        const headAxisLength = headHalfWidth * rHeadSlope;
        const headNormalLength = Math.hypot(headHalfWidth, headAxisLength);
        const openHeadAxisInset =
            headShape == "open" && headNormalLength > 0
                ? (size * headHalfWidth) / headNormalLength
                : 0;
        const headBack = add(
            tip,
            scale(tangent, -headAxisLength - openHeadAxisInset)
        );
        const strokeWidth = encodeNumber(encoders.strokeWidth, datum);
        const transversePadding =
            Math.max(stem ? stemHalfWidth : 0, headHalfWidth) + strokeWidth * 2;
        if (
            !intersectsSvgBounds(
                visibleBounds,
                Math.min(tail.x, tip.x, headBack.x),
                Math.min(tail.y, tip.y, headBack.y),
                Math.max(tail.x, tip.x, headBack.x),
                Math.max(tail.y, tip.y, headBack.y),
                transversePadding
            )
        ) {
            continue;
        }
        const renderedHeadShape =
            headShape == "triangle" || headShape == "open"
                ? headShape
                : "triangle";
        if (renderedHeadShape != headShape) {
            options.warn(
                `SVG export rendered unsupported arrow headShape "${headShape}" as a triangle.`
            );
        }

        const polygons = stem
            ? [
                  createStemPolygon(
                      tail,
                      tip,
                      tangent,
                      normal,
                      stemHalfWidth,
                      rHeadSlope,
                      startNotch
                  ),
              ]
            : [];
        const headRepeatFootprint =
            headAxisLength +
            headStrokeWidth / Math.hypot(rHeadSlope, 1) +
            strokeWidth;
        const repeatSpacing = !repeatHeads
            ? Infinity
            : Math.max((headSpacing ?? 0) * size, headRepeatFootprint);
        const geometryLength = Math.hypot(tip.x - tail.x, tip.y - tail.y);
        for (let distance = 0; ; distance += repeatSpacing) {
            if (
                distance > 0 &&
                distance + headRepeatFootprint - strokeWidth / 2 >
                    geometryLength
            ) {
                break;
            }
            const repeatedTip = add(tip, scale(tangent, -distance));
            polygons.push(
                renderedHeadShape == "open"
                    ? createOpenHeadPolygon(
                          repeatedTip,
                          tangent,
                          normal,
                          headHalfWidth,
                          rHeadSlope,
                          rHeadNotchSlope,
                          size
                      )
                    : createTriangleHeadPolygon(
                          repeatedTip,
                          tangent,
                          normal,
                          headHalfWidth,
                          rHeadSlope,
                          rHeadNotchSlope
                      )
            );
            if (!repeatHeads || repeatSpacing <= 0) {
                break;
            }
        }

        const path = createSvgElement("path", {
            d: unionPolygons(polygons).map(polygon).join(" "),
            "data-arrow-part":
                renderedHeadShape == "open" && !stem ? "head" : "body",
        });
        const instance = createSvgElement("g", encodeStyles(datum));
        instance.appendChild(path);
        group.appendChild(instance);
    }
}

/**
 * @typedef {{x: number, y: number}} Point
 */

/**
 * @param {Point} tip
 * @param {Point} tangent
 * @param {Point} normal
 * @param {number} headHalfWidth
 * @param {number} rHeadSlope
 * @param {number} rHeadNotchSlope
 * @returns {Point[]}
 */
function createTriangleHeadPolygon(
    tip,
    tangent,
    normal,
    headHalfWidth,
    rHeadSlope,
    rHeadNotchSlope
) {
    const headAxisLength = headHalfWidth * rHeadSlope;
    const notchLength = headAxisLength - headHalfWidth * rHeadNotchSlope;
    const headTop = add(
        add(tip, scale(tangent, -headAxisLength)),
        scale(normal, headHalfWidth)
    );
    const headBottom = add(
        add(tip, scale(tangent, -headAxisLength)),
        scale(normal, -headHalfWidth)
    );
    const headNotch = add(tip, scale(tangent, -notchLength));
    return [tip, headTop, headNotch, headBottom];
}

/**
 * @param {Point} tail
 * @param {Point} tip
 * @param {Point} tangent
 * @param {Point} normal
 * @param {number} halfWidth
 * @param {number} rHeadSlope
 * @param {boolean} startNotch
 * @returns {Point[]}
 */
function createStemPolygon(
    tail,
    tip,
    tangent,
    normal,
    halfWidth,
    rHeadSlope,
    startNotch
) {
    const headSideLength = halfWidth * rHeadSlope;
    const headTop = add(
        add(tip, scale(tangent, -headSideLength)),
        scale(normal, halfWidth)
    );
    const headBottom = add(
        add(tip, scale(tangent, -headSideLength)),
        scale(normal, -halfWidth)
    );
    const tailTop = add(tail, scale(normal, halfWidth));
    const tailBottom = add(tail, scale(normal, -halfWidth));
    const tailNotch = startNotch
        ? [add(tail, scale(tangent, halfWidth * rHeadSlope))]
        : [];

    return [tip, headTop, tailTop, ...tailNotch, tailBottom, headBottom];
}

/**
 * @param {Point} tip
 * @param {Point} tangent
 * @param {Point} normal
 * @param {number} headHalfWidth
 * @param {number} rHeadSlope
 * @param {number} rHeadNotchSlope
 * @param {number} thickness
 */
function createOpenHeadPolygon(
    tip,
    tangent,
    normal,
    headHalfWidth,
    rHeadSlope,
    rHeadNotchSlope,
    thickness
) {
    const headLength = headHalfWidth * rHeadSlope;
    const outerTop = add(
        add(tip, scale(tangent, -headLength)),
        scale(normal, headHalfWidth)
    );
    const outerBottom = add(
        add(tip, scale(tangent, -headLength)),
        scale(normal, -headHalfWidth)
    );
    const normalLength = Math.hypot(headHalfWidth, headLength);
    const axisInset = (thickness * headHalfWidth) / normalLength;
    const sideInset = (thickness * headLength) / normalLength;
    const innerTop = add(
        add(outerTop, scale(tangent, -axisInset)),
        scale(normal, -sideInset)
    );
    const innerBottom = add(
        add(outerBottom, scale(tangent, -axisInset)),
        scale(normal, sideInset)
    );
    const notchLength =
        headLength + axisInset - (headHalfWidth - sideInset) * rHeadNotchSlope;
    const notch = add(tip, scale(tangent, -notchLength));
    return [tip, outerTop, innerTop, notch, innerBottom, outerBottom];
}

/**
 * Ports the arrow vertex shader's short-arrow blunting calculation.
 *
 * @param {object} options
 * @param {number} options.segmentLength
 * @param {number} options.headHalfWidth
 * @param {number} options.stemHalfWidth Negative when the stem is hidden.
 * @param {number} options.configuredRHeadSlope
 * @param {number} options.configuredRHeadNotchSlope
 * @param {boolean} options.headRepeat
 * @param {"inside" | "outside"} options.headPlacement
 * @param {boolean} options.startNotch
 * @param {number} options.minStemLength
 * @param {"triangle" | "open"} options.headShape
 */
function effectiveHeadSlope({
    segmentLength,
    headHalfWidth,
    stemHalfWidth,
    configuredRHeadSlope,
    configuredRHeadNotchSlope,
    headRepeat,
    headPlacement,
    startNotch,
    minStemLength,
    headShape,
}) {
    if (headRepeat || stemHalfWidth < 0) {
        return configuredRHeadSlope;
    } else if (headPlacement == "outside") {
        if (!startNotch || stemHalfWidth <= 0) {
            return configuredRHeadSlope;
        }

        const maxStartNotchLength = Math.max(segmentLength - minStemLength, 0);
        return Math.min(
            configuredRHeadSlope,
            maxStartNotchLength / stemHalfWidth
        );
    } else if (headShape != "triangle") {
        return configuredRHeadSlope;
    }

    const maxJoinLength = Math.max(segmentLength - minStemLength, 0);
    const configuredJoinLength = triangleHeadStemJoinLength(
        stemHalfWidth,
        headHalfWidth,
        configuredRHeadSlope,
        configuredRHeadNotchSlope
    );
    if (configuredJoinLength <= maxJoinLength) {
        return configuredRHeadSlope;
    }

    const boundaryJoinLength = stemHalfWidth * configuredRHeadNotchSlope;
    if (maxJoinLength < boundaryJoinLength) {
        return stemHalfWidth > 0
            ? clamp(maxJoinLength / stemHalfWidth, 0, configuredRHeadSlope)
            : 0;
    }

    return clamp(
        (maxJoinLength +
            (headHalfWidth - stemHalfWidth) * configuredRHeadNotchSlope) /
            headHalfWidth,
        0,
        configuredRHeadSlope
    );
}

/**
 * @param {number} stemHalfWidth
 * @param {number} headHalfWidth
 * @param {number} rHeadSlope
 * @param {number} rHeadNotchSlope
 */
function triangleHeadStemJoinLength(
    stemHalfWidth,
    headHalfWidth,
    rHeadSlope,
    rHeadNotchSlope
) {
    const clampedRHeadNotchSlope = Math.min(rHeadNotchSlope, rHeadSlope);
    return (
        headHalfWidth * rHeadSlope -
        (headHalfWidth - stemHalfWidth) * clampedRHeadNotchSlope
    );
}

/**
 * @param {number} headHalfWidth
 * @param {number} rHeadSlope
 * @param {number} rHeadNotchSlope
 * @param {number} headStrokeWidth
 */
function headNotchOffset(
    headHalfWidth,
    rHeadSlope,
    rHeadNotchSlope,
    headStrokeWidth
) {
    if (headHalfWidth <= 0) {
        return 0;
    }

    const headAxisLength = headHalfWidth * rHeadSlope;
    const normalLength = Math.hypot(headHalfWidth, headAxisLength);
    const innerX =
        headAxisLength + (headStrokeWidth * headHalfWidth) / normalLength;
    const innerY =
        headHalfWidth - (headStrokeWidth * headAxisLength) / normalLength;
    return innerX - innerY * rHeadNotchSlope;
}

/** @param {number} angle */
function reciprocalSlope(angle) {
    const radians = (clamp(angle, 1, 90) * Math.PI) / 180;
    return 1 / Math.max(Math.tan(radians), 1e-6);
}

/** @param {Point[]} points */
function polygon(points) {
    return `M ${points.map(point).join(" L ")} Z`;
}

/** @param {Point} value */
function point(value) {
    return `${formatSvgNumber(value.x)} ${formatSvgNumber(value.y)}`;
}

/** @param {Point} a @param {Point} b */
function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
}

/** @param {Point} a @param {Point} b */
function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
}

/** @param {Point} value @param {number} factor */
function scale(value, factor) {
    return { x: value.x * factor, y: value.y * factor };
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
