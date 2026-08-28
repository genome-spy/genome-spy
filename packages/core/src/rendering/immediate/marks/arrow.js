import { unionPolygons } from "../geometry/polygonUnion.js";
import { intersectsBounds } from "../bounds.js";
import {
    encodeNumber,
    encodeString,
    prepareRangeProjection,
    resolveMarkProperty,
    toPaintString,
} from "../markEncoding.js";

/** @typedef {{x: number, y: number}} ArrowPoint */

/**
 * @typedef {object} ArrowSkeletonInstance
 * @prop {object} datum
 * @prop {ArrowPoint} tail
 * @prop {ArrowPoint} tip
 * @prop {ArrowPoint} tangent
 * @prop {ArrowPoint} normal
 * @prop {number} size
 * @prop {number} stemHalfWidth
 * @prop {number} headHalfWidth
 * @prop {number} headAxisLength
 * @prop {number} rHeadSlope
 * @prop {number} rHeadNotchSlope
 * @prop {number} strokeWidth
 * @prop {number} repeatSpacing
 * @prop {number} headRepeatFootprint
 * @prop {number} geometryLength
 * @prop {boolean} stemContainsHead
 * @prop {"triangle" | "open"} renderedHeadShape
 * @prop {boolean} headShapeFallback
 */

/**
 * @typedef {object} ArrowInstance
 * @prop {object} datum
 * @prop {ArrowPoint[][]} boundaryLoops
 * @prop {number} strokeWidth
 * @prop {boolean} headShapeFallback
 */

/** @param {import("../../../marks/arrow.js").default} mark */
export function resolveArrowProperties(mark) {
    const props = mark.properties;
    const headSpacing = resolveMarkProperty(mark, props.headSpacing);
    return {
        configuredRHeadSlope: reciprocalSlope(
            resolveMarkProperty(mark, props.headAngle)
        ),
        configuredRHeadNotchSlope: reciprocalSlope(
            resolveMarkProperty(mark, props.headNotchAngle)
        ),
        headShape: resolveMarkProperty(mark, props.headShape),
        headWidth: resolveMarkProperty(mark, props.headWidth),
        minSize: resolveMarkProperty(mark, props.minSize),
        stem: resolveMarkProperty(mark, props.stem),
        startNotch: resolveMarkProperty(mark, props.startNotch),
        minStemLength: resolveMarkProperty(mark, props.minStemLength),
        headSpacing,
        repeatHeads: headSpacing != null && headSpacing >= 0,
        headPlacement: resolveMarkProperty(mark, props.headPlacement),
    };
}

/**
 * @param {import("../../../marks/arrow.js").default} mark
 * @param {ReturnType<typeof resolveArrowProperties>} properties
 * @param {{coords: import("../../../view/layout/rectangle.js").default, data: object[], visibleBounds: import("../bounds.js").RenderBounds, viewOpacity: number, countOnly?: boolean}} options
 * @param {(instance: ArrowInstance) => void} visitor
 */
export function visitArrowInstances(mark, properties, options, visitor) {
    const { viewOpacity } = options;
    const encoders =
        /** @type {Record<string, import("../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    return visitArrowSkeletonInstances(
        mark,
        properties,
        options,
        (skeleton) => {
            const stemPolygon = properties.stem
                ? createStemPolygon(
                      skeleton.tail,
                      skeleton.tip,
                      skeleton.tangent,
                      skeleton.normal,
                      skeleton.stemHalfWidth,
                      skeleton.rHeadSlope,
                      properties.startNotch
                  )
                : null;
            const polygons = stemPolygon ? [stemPolygon] : [];
            visitArrowHeadPositions(skeleton, (x, y) => {
                const repeatedTip = { x, y };
                polygons.push(
                    skeleton.renderedHeadShape == "open"
                        ? createOpenHeadPolygon(
                              repeatedTip,
                              skeleton.tangent,
                              skeleton.normal,
                              skeleton.headHalfWidth,
                              skeleton.rHeadSlope,
                              skeleton.rHeadNotchSlope,
                              skeleton.size
                          )
                        : createTriangleHeadPolygon(
                              repeatedTip,
                              skeleton.tangent,
                              skeleton.normal,
                              skeleton.headHalfWidth,
                              skeleton.rHeadSlope,
                              skeleton.rHeadNotchSlope
                          )
                );
            });
            const hasVisibleStroke =
                toPaintString(encoders.stroke(skeleton.datum)) != "none" &&
                encodeNumber(encoders.strokeOpacity, skeleton.datum) *
                    viewOpacity >
                    0 &&
                skeleton.strokeWidth > 0;
            visitor({
                datum: skeleton.datum,
                boundaryLoops:
                    polygons.length == 1 || !hasVisibleStroke
                        ? polygons
                        : unionPolygons(polygons),
                strokeWidth: skeleton.strokeWidth,
                headShapeFallback: skeleton.headShapeFallback,
            });
        }
    );
}

/**
 * Visits projected arrow axes and scalar geometry without constructing boundary
 * loops. The visitor must consume the reused record synchronously.
 *
 * @param {import("../../../marks/arrow.js").default} mark
 * @param {ReturnType<typeof resolveArrowProperties>} properties
 * @param {{coords: import("../../../view/layout/rectangle.js").default, data: object[], visibleBounds: import("../bounds.js").RenderBounds, countOnly?: boolean}} options
 * @param {(instance: ArrowSkeletonInstance) => void} visitor
 */
export function visitArrowSkeletonInstances(
    mark,
    properties,
    options,
    visitor
) {
    const { coords, data, visibleBounds, countOnly } = options;
    const encoders =
        /** @type {Record<string, import("../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    if (data.length == 0) {
        return 0;
    }
    const projectXRange = prepareRangeProjection(
        coords,
        encoders,
        "x",
        data[0]
    );
    const projectYRange = prepareRangeProjection(
        coords,
        encoders,
        "y",
        data[0]
    );
    const xRange = /** @type {[number, number]} */ ([0, 0]);
    const yRange = /** @type {[number, number]} */ ([0, 0]);
    /** @type {ArrowSkeletonInstance} */
    const instance = {
        datum: {},
        tail: { x: 0, y: 0 },
        tip: { x: 0, y: 0 },
        tangent: { x: 0, y: 0 },
        normal: { x: 0, y: 0 },
        size: 0,
        stemHalfWidth: 0,
        headHalfWidth: 0,
        headAxisLength: 0,
        rHeadSlope: 0,
        rHeadNotchSlope: 0,
        strokeWidth: 0,
        repeatSpacing: Infinity,
        headRepeatFootprint: 0,
        geometryLength: 0,
        stemContainsHead: false,
        renderedHeadShape: "triangle",
        headShapeFallback: false,
    };
    let instanceCount = 0;

    for (const datum of data) {
        projectXRange(datum, xRange);
        projectYRange(datum, yRange);
        const reverse = encodeString(encoders.direction, datum) == "reverse";
        const tailX = reverse ? xRange[1] : xRange[0];
        const tailY = reverse ? yRange[1] : yRange[0];
        const endpointX = reverse ? xRange[0] : xRange[1];
        const endpointY = reverse ? yRange[0] : yRange[1];
        const segmentX = endpointX - tailX;
        const segmentY = endpointY - tailY;
        const segmentLength = Math.hypot(segmentX, segmentY);
        if (segmentLength == 0) {
            continue;
        }

        const tangentX = segmentX / segmentLength;
        const tangentY = segmentY / segmentLength;
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
        const tipX = endpointX + tangentX * outsideHeadOffset;
        const tipY = endpointY + tangentY * outsideHeadOffset;
        const headAxisLength = headHalfWidth * rHeadSlope;
        const headNormalLength = Math.hypot(headHalfWidth, headAxisLength);
        const openHeadAxisInset =
            properties.headShape == "open" && headNormalLength > 0
                ? (size * headHalfWidth) / headNormalLength
                : 0;
        const headBackX =
            tipX - tangentX * (headAxisLength + openHeadAxisInset);
        const headBackY =
            tipY - tangentY * (headAxisLength + openHeadAxisInset);
        const strokeWidth = encodeNumber(encoders.strokeWidth, datum);
        const transversePadding =
            Math.max(properties.stem ? stemHalfWidth : 0, headHalfWidth) +
            strokeWidth * 2;
        if (
            !intersectsBounds(
                visibleBounds,
                Math.min(tailX, tipX, headBackX),
                Math.min(tailY, tipY, headBackY),
                Math.max(tailX, tipX, headBackX),
                Math.max(tailY, tipY, headBackY),
                transversePadding
            )
        ) {
            continue;
        }

        instanceCount++;
        if (countOnly) {
            continue;
        }
        const renderedHeadShape =
            properties.headShape == "triangle" || properties.headShape == "open"
                ? properties.headShape
                : "triangle";
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

        instance.datum = datum;
        setPoint(instance.tail, tailX, tailY);
        setPoint(instance.tip, tipX, tipY);
        setPoint(instance.tangent, tangentX, tangentY);
        setPoint(instance.normal, -tangentY, tangentX);
        instance.size = size;
        instance.stemHalfWidth = stemHalfWidth;
        instance.headHalfWidth = headHalfWidth;
        instance.headAxisLength = headAxisLength;
        instance.rHeadSlope = rHeadSlope;
        instance.rHeadNotchSlope = rHeadNotchSlope;
        instance.strokeWidth = strokeWidth;
        instance.repeatSpacing = repeatSpacing;
        instance.headRepeatFootprint = headRepeatFootprint;
        instance.geometryLength = Math.hypot(tipX - tailX, tipY - tailY);
        instance.stemContainsHead =
            properties.stem &&
            renderedHeadShape == "triangle" &&
            !properties.repeatHeads &&
            headHalfWidth <= stemHalfWidth;
        instance.renderedHeadShape = renderedHeadShape;
        instance.headShapeFallback = renderedHeadShape != properties.headShape;
        visitor(instance);
    }
    return instanceCount;
}

/**
 * @param {ArrowSkeletonInstance} instance
 * @param {(x: number, y: number) => void} visitor
 */
export function visitArrowHeadPositions(instance, visitor) {
    for (
        let distance = 0;
        !instance.stemContainsHead;
        distance += instance.repeatSpacing
    ) {
        if (
            distance > 0 &&
            distance + instance.headRepeatFootprint - instance.strokeWidth / 2 >
                instance.geometryLength
        ) {
            break;
        }
        visitor(
            instance.tip.x - instance.tangent.x * distance,
            instance.tip.y - instance.tangent.y * distance
        );
        if (
            !(instance.repeatSpacing > 0) ||
            !Number.isFinite(instance.repeatSpacing)
        ) {
            break;
        }
    }
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

/** @param {ArrowPoint} value @param {number} factor */
function scale(value, factor) {
    return { x: value.x * factor, y: value.y * factor };
}

/** @param {ArrowPoint} target @param {number} x @param {number} y */
function setPoint(target, x, y) {
    target.x = x;
    target.y = y;
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
