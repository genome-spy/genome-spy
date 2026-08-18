import { intersectsSvgBounds } from "../../svg/svgBounds.js";
import {
    encodeNumber,
    projectXRange,
    projectYRange,
    resolveSvgProperty,
} from "../../svg/svgMarkUtils.js";
import { getBezierPoints } from "./linkGeometry.js";

/**
 * @typedef {object} LinkInstance
 * @prop {object} datum
 * @prop {[[number, number], [number, number], [number, number], [number, number]]} points
 * @prop {number} strokeWidth
 */

/** @param {import("../../marks/link.js").default} mark */
export function resolveLinkProperties(mark) {
    const props = mark.properties;
    return {
        shape: resolveSvgProperty(mark, props.linkShape),
        orient: resolveSvgProperty(mark, props.orient),
        arcHeightFactor: resolveSvgProperty(mark, props.arcHeightFactor),
        minArcHeight: resolveSvgProperty(mark, props.minArcHeight),
        maxChordLength: resolveSvgProperty(mark, props.maxChordLength),
        clampApex: resolveSvgProperty(mark, props.clampApex),
    };
}

/**
 * @param {import("../../marks/link.js").default} mark
 * @param {ReturnType<typeof resolveLinkProperties>} properties
 * @param {{coords: import("../../view/layout/rectangle.js").default, data: object[], visibleBounds: import("../../svg/svgBounds.js").SvgBounds}} options
 * @param {(instance: LinkInstance) => void} visitor
 */
export function visitLinkInstances(mark, properties, options, visitor) {
    const { coords, data, visibleBounds } = options;
    const encoders =
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    let instanceCount = 0;

    for (const datum of data) {
        const [x, x2] = projectXRange(coords, encoders, datum);
        const [y, y2] = projectYRange(coords, encoders, datum);
        const points = getBezierPoints(
            [x - coords.x, coords.y2 - y],
            [x2 - coords.x, coords.y2 - y2],
            { width: coords.width, height: coords.height },
            properties
        );
        for (const point of points) {
            point[0] += coords.x;
            point[1] = coords.y + coords.height - point[1];
        }
        const [p1, p2, p3, p4] = points;
        const strokeWidth = encodeNumber(encoders.size, datum);
        if (
            !intersectsSvgBounds(
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

export { getBezierPoints } from "./linkGeometry.js";
