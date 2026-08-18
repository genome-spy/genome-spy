import { unionPolygons } from "../../svg/polygonUnion.js";
import { intersectsSvgBounds } from "../../svg/svgBounds.js";
import {
    encodeNumber,
    encodeString,
    projectXRange,
    projectYRange,
    resolveSvgProperty,
    toSvgString,
} from "../../svg/svgMarkUtils.js";

/** @typedef {{x: number, y: number}} ArrowPoint */

/**
 * @typedef {object} ArrowInstance
 * @prop {object} datum
 * @prop {ArrowPoint[][]} boundaryLoops
 * @prop {number} strokeWidth
 * @prop {boolean} headShapeFallback
 */

/** @param {import("../../marks/arrow.js").default} mark */
export function resolveArrowProperties(mark) {
    const props = mark.properties;
    const headSpacing = resolveSvgProperty(mark, props.headSpacing);
    return {
        configuredRHeadSlope: reciprocalSlope(
            resolveSvgProperty(mark, props.headAngle)
        ),
        configuredRHeadNotchSlope: reciprocalSlope(
            resolveSvgProperty(mark, props.headNotchAngle)
        ),
        headShape: resolveSvgProperty(mark, props.headShape),
        headWidth: resolveSvgProperty(mark, props.headWidth),
        minSize: resolveSvgProperty(mark, props.minSize),
        stem: resolveSvgProperty(mark, props.stem),
        startNotch: resolveSvgProperty(mark, props.startNotch),
        minStemLength: resolveSvgProperty(mark, props.minStemLength),
        headSpacing,
        repeatHeads: headSpacing != null && headSpacing >= 0,
        headPlacement: resolveSvgProperty(mark, props.headPlacement),
    };
}

/**
 * @param {import("../../marks/arrow.js").default} mark
 * @param {ReturnType<typeof resolveArrowProperties>} properties
 * @param {{coords: import("../../view/layout/rectangle.js").default, data: object[], visibleBounds: import("../../svg/svgBounds.js").SvgBounds, viewOpacity: number}} options
 * @param {(instance: ArrowInstance) => void} visitor
 */
export function visitArrowInstances(mark, properties, options, visitor) {
    const { coords, data, visibleBounds, viewOpacity } = options;
    const encoders =
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    let instanceCount = 0;

    for (const datum of data) {
        const [x, x2] = projectXRange(coords, encoders, datum);
        const [y, y2] = projectYRange(coords, encoders, datum);
        const a = { x, y };
        const b = { x: x2, y: y2 };
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
        const size = Math.max(
            encodeNumber(encoders.size, datum),
            properties.minSize
        );
        const stemHalfWidth = size / 2;
        const headHalfWidth = Math.max(properties.headWidth * size, 0) / 2;
        const rHeadSlope = effectiveHeadSlope({
            segmentLength,
            headHalfWidth,
            stemHalfWidth: properties.stem ? stemHalfWidth : -stemHalfWidth,
            configuredRHeadSlope: properties.configuredRHeadSlope,
            configuredRHeadNotchSlope: properties.configuredRHeadNotchSlope,
            headRepeat: properties.repeatHeads,
            headPlacement: properties.headPlacement,
            startNotch: properties.startNotch,
            minStemLength: properties.minStemLength,
            headShape: properties.headShape,
        });
        const rHeadNotchSlope =
            properties.headShape == "open"
                ? rHeadSlope
                : Math.min(properties.configuredRHeadNotchSlope, rHeadSlope);
        const headStrokeWidth = properties.headShape == "open" ? size : 0;
        const outsideHeadOffset =
            properties.headPlacement == "outside"
                ? headNotchOffset(
                      headHalfWidth,
                      rHeadSlope,
                      rHeadNotchSlope,
                      headStrokeWidth
                  )
                : 0;
        const tip =
            properties.headPlacement == "outside"
                ? add(endpoint, scale(tangent, outsideHeadOffset))
                : endpoint;
        const headAxisLength = headHalfWidth * rHeadSlope;
        const headNormalLength = Math.hypot(headHalfWidth, headAxisLength);
        const openHeadAxisInset =
            properties.headShape == "open" && headNormalLength > 0
                ? (size * headHalfWidth) / headNormalLength
                : 0;
        const headBack = add(
            tip,
            scale(tangent, -headAxisLength - openHeadAxisInset)
        );
        const strokeWidth = encodeNumber(encoders.strokeWidth, datum);
        const transversePadding =
            Math.max(properties.stem ? stemHalfWidth : 0, headHalfWidth) +
            strokeWidth * 2;
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
            properties.headShape == "triangle" || properties.headShape == "open"
                ? properties.headShape
                : "triangle";
        const stemPolygon = properties.stem
            ? createStemPolygon(
                  tail,
                  tip,
                  tangent,
                  normal,
                  stemHalfWidth,
                  rHeadSlope,
                  properties.startNotch
              )
            : null;
        const polygons = stemPolygon ? [stemPolygon] : [];
        const stemContainsHead =
            stemPolygon &&
            renderedHeadShape == "triangle" &&
            !properties.repeatHeads &&
            headHalfWidth <= stemHalfWidth;
        const headRepeatFootprint =
            headAxisLength +
            headStrokeWidth / Math.hypot(rHeadSlope, 1) +
            strokeWidth;
        const repeatSpacing = !properties.repeatHeads
            ? Infinity
            : Math.max(
                  (properties.headSpacing ?? 0) * size,
                  headRepeatFootprint
              );
        const geometryLength = Math.hypot(tip.x - tail.x, tip.y - tail.y);
        for (let distance = 0; !stemContainsHead; distance += repeatSpacing) {
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
            if (!properties.repeatHeads || repeatSpacing <= 0) {
                break;
            }
        }

        const hasVisibleStroke =
            toSvgString(encoders.stroke(datum)) != "none" &&
            encodeNumber(encoders.strokeOpacity, datum) * viewOpacity > 0 &&
            strokeWidth > 0;
        instanceCount++;
        visitor({
            datum,
            boundaryLoops:
                polygons.length == 1 || !hasVisibleStroke
                    ? polygons
                    : unionPolygons(polygons),
            strokeWidth,
            headShapeFallback: renderedHeadShape != properties.headShape,
        });
    }
    return instanceCount;
}

/**
 * @param {ArrowPoint} tip
 * @param {ArrowPoint} tangent
 * @param {ArrowPoint} normal
 * @param {number} headHalfWidth
 * @param {number} rHeadSlope
 * @param {number} rHeadNotchSlope
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
 * @param {ArrowPoint} tail
 * @param {ArrowPoint} tip
 * @param {ArrowPoint} tangent
 * @param {ArrowPoint} normal
 * @param {number} halfWidth
 * @param {number} rHeadSlope
 * @param {boolean} startNotch
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
 * @param {ArrowPoint} tip
 * @param {ArrowPoint} tangent
 * @param {ArrowPoint} normal
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
 * @param {object} options
 * @param {number} options.segmentLength
 * @param {number} options.headHalfWidth
 * @param {number} options.stemHalfWidth
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
        return Math.min(
            configuredRHeadSlope,
            Math.max(segmentLength - minStemLength, 0) / stemHalfWidth
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
    return (
        headHalfWidth * rHeadSlope -
        (headHalfWidth - stemHalfWidth) * Math.min(rHeadNotchSlope, rHeadSlope)
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

/** @param {ArrowPoint} a @param {ArrowPoint} b */
function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
}

/** @param {ArrowPoint} a @param {ArrowPoint} b */
function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
}

/** @param {ArrowPoint} value @param {number} factor */
function scale(value, factor) {
    return { x: value.x * factor, y: value.y * factor };
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
