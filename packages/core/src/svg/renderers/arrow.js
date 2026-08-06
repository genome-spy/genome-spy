import { createSvgElement } from "../svgElement.js";
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
    const headAngle = clamp(resolveSvgProperty(mark, props.headAngle), 1, 90);
    const headShape = resolveSvgProperty(mark, props.headShape);
    const headWidth = resolveSvgProperty(mark, props.headWidth);
    const minSize = resolveSvgProperty(mark, props.minSize);
    const stem = resolveSvgProperty(mark, props.stem);
    const headPlacement = resolveSvgProperty(mark, props.headPlacement);

    if (resolveSvgProperty(mark, props.headSpacing) != null) {
        options.warn(
            "SVG export rendered one arrowhead and ignored unsupported repeated heads."
        );
    }
    if (stem && resolveSvgProperty(mark, props.startNotch)) {
        options.warn("SVG export ignored an unsupported arrow start notch.");
    }
    if (
        stem &&
        resolveSvgProperty(mark, props.headSpacing) == null &&
        resolveSvgProperty(mark, props.minStemLength) > 0
    ) {
        options.warn(
            "SVG export ignored unsupported short-arrow head blunting."
        );
    }
    if (
        headShape == "triangle" &&
        resolveSvgProperty(mark, props.headNotchAngle) != 90
    ) {
        options.warn(
            "SVG export used an unnotched triangle for an unsupported arrow headNotchAngle."
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
        const configuredHeadLength =
            headHalfWidth / Math.tan((headAngle * Math.PI) / 180);
        const headLength =
            headPlacement == "outside"
                ? configuredHeadLength
                : Math.min(configuredHeadLength, segmentLength);
        const join = add(endpoint, scale(tangent, -headLength));
        const tip =
            headPlacement == "outside"
                ? add(endpoint, scale(tangent, headLength))
                : endpoint;
        const headBase = headPlacement == "outside" ? endpoint : join;
        const instance = createSvgElement("g", encodeStyles(datum));

        if (headShape == "triangle") {
            instance.appendChild(
                createSvgElement("path", {
                    d: createTriangleArrowPath(
                        tail,
                        tip,
                        headBase,
                        normal,
                        stemHalfWidth,
                        headHalfWidth,
                        stem
                    ),
                    "data-arrow-part": "body",
                })
            );
        } else if (headShape == "open") {
            if (stem) {
                instance.appendChild(
                    createSvgElement("path", {
                        d: polygon([
                            add(tail, scale(normal, stemHalfWidth)),
                            add(headBase, scale(normal, stemHalfWidth)),
                            add(headBase, scale(normal, -stemHalfWidth)),
                            add(tail, scale(normal, -stemHalfWidth)),
                        ]),
                        "data-arrow-part": "stem",
                    })
                );
            }
            instance.appendChild(
                createSvgElement("path", {
                    d: createOpenHeadPath(
                        tip,
                        tangent,
                        normal,
                        headLength,
                        headHalfWidth,
                        size
                    ),
                    "data-arrow-part": "head",
                })
            );
        } else {
            options.warn(
                `SVG export rendered unsupported arrow headShape "${headShape}" as a triangle.`
            );
            instance.appendChild(
                createSvgElement("path", {
                    d: createTriangleArrowPath(
                        tail,
                        tip,
                        headBase,
                        normal,
                        stemHalfWidth,
                        headHalfWidth,
                        stem
                    ),
                    "data-arrow-part": "body",
                })
            );
        }
        group.appendChild(instance);
    }
}

/**
 * @typedef {{x: number, y: number}} Point
 */

/**
 * @param {Point} tail
 * @param {Point} tip
 * @param {Point} base
 * @param {Point} normal
 * @param {number} stemHalfWidth
 * @param {number} headHalfWidth
 * @param {boolean} stem
 */
function createTriangleArrowPath(
    tail,
    tip,
    base,
    normal,
    stemHalfWidth,
    headHalfWidth,
    stem
) {
    const headTop = add(base, scale(normal, headHalfWidth));
    const headBottom = add(base, scale(normal, -headHalfWidth));
    if (!stem) {
        return polygon([headTop, tip, headBottom]);
    }
    return polygon([
        add(tail, scale(normal, stemHalfWidth)),
        add(base, scale(normal, stemHalfWidth)),
        headTop,
        tip,
        headBottom,
        add(base, scale(normal, -stemHalfWidth)),
        add(tail, scale(normal, -stemHalfWidth)),
    ]);
}

/**
 * @param {Point} tip
 * @param {Point} tangent
 * @param {Point} normal
 * @param {number} headLength
 * @param {number} headHalfWidth
 * @param {number} thickness
 */
function createOpenHeadPath(
    tip,
    tangent,
    normal,
    headLength,
    headHalfWidth,
    thickness
) {
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
    const notch = add(tip, scale(tangent, -headLength));
    return polygon([tip, outerTop, innerTop, notch, innerBottom, outerBottom]);
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
