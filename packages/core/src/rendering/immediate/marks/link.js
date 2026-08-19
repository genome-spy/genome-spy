import { intersectsBounds } from "../bounds.js";
import {
    encodeNumber,
    prepareRangeProjection,
    resolveMarkProperty,
} from "../markEncoding.js";
import { getBezierPoints } from "../geometry/linkGeometry.js";

/**
 * @typedef {object} LinkInstance
 * @prop {object} datum
 * @prop {[[number, number], [number, number], [number, number], [number, number]]} points
 * @prop {number} strokeWidth
 */

/** @param {import("../../../marks/link.js").default} mark */
export function resolveLinkProperties(mark) {
    const props = mark.properties;
    return {
        shape: resolveMarkProperty(mark, props.linkShape),
        orient: resolveMarkProperty(mark, props.orient),
        arcHeightFactor: resolveMarkProperty(mark, props.arcHeightFactor),
        minArcHeight: resolveMarkProperty(mark, props.minArcHeight),
        maxChordLength: resolveMarkProperty(mark, props.maxChordLength),
        clampApex: resolveMarkProperty(mark, props.clampApex),
    };
}

/**
 * @param {import("../../../marks/link.js").default} mark
 * @param {ReturnType<typeof resolveLinkProperties>} properties
 * @param {{coords: import("../../../view/layout/rectangle.js").default, data: object[], visibleBounds: import("../bounds.js").RenderBounds}} options
 * @param {(instance: LinkInstance) => void} visitor
 */
export function visitLinkInstances(mark, properties, options, visitor) {
    const { coords, data, visibleBounds } = options;
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
    const coordsX = coords.x;
    const coordsY = coords.y;
    const viewport = { width: coords.width, height: coords.height };
    const coordsY2 = coordsY + viewport.height;
    let instanceCount = 0;

    for (const datum of data) {
        projectXRange(datum, xRange);
        projectYRange(datum, yRange);
        const [x, x2] = xRange;
        const [y, y2] = yRange;
        const points = getBezierPoints(
            [x - coordsX, coordsY2 - y],
            [x2 - coordsX, coordsY2 - y2],
            viewport,
            properties
        );
        for (const point of points) {
            point[0] += coordsX;
            point[1] = coordsY2 - point[1];
        }
        const [p1, p2, p3, p4] = points;
        const strokeWidth = encodeNumber(encoders.size, datum);
        if (
            !intersectsBounds(
                visibleBounds,
                Math.min(p1[0], p2[0], p3[0], p4[0]),
                Math.min(p1[1], p2[1], p3[1], p4[1]),
                Math.max(p1[0], p2[0], p3[0], p4[0]),
                Math.max(p1[1], p2[1], p3[1], p4[1]),
                strokeWidth / 2
            )
        ) {
            continue;
        }

        instanceCount++;
        visitor({ datum, points, strokeWidth });
    }
    return instanceCount;
}
