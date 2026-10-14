import { isMarkClamped } from "../../../marks/markUtils.js";
import { intersectsBounds } from "../bounds.js";
import {
    encodeNumber,
    prepareRangeProjection,
    resolveMarkProperty,
} from "../markEncoding.js";
import { getLinkGeometry } from "../geometry/linkGeometry.js";

/**
 * @typedef {object} LinkInstance
 * @prop {object} datum
 * @prop {import("../geometry/linkGeometry.js").LinkGeometry} geometry
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
        data[0],
        isMarkClamped(mark, "x")
    );
    const projectYRange = prepareRangeProjection(
        coords,
        encoders,
        "y",
        data[0],
        isMarkClamped(mark, "y")
    );
    const xRange = /** @type {[number, number]} */ ([0, 0]);
    const yRange = /** @type {[number, number]} */ ([0, 0]);
    const coordsX = coords.x;
    const coordsY = coords.y;
    const viewport = { width: coords.width, height: coords.height };
    const coordsY2 = coordsY + viewport.height;
    const clamped = isMarkClamped(mark, "x") || isMarkClamped(mark, "y");
    let instanceCount = 0;

    for (const datum of data) {
        projectXRange(datum, xRange);
        projectYRange(datum, yRange);
        if (
            (clamped || properties.shape == "orthogonal") &&
            xRange[0] === xRange[1] &&
            yRange[0] === yRange[1]
        ) {
            continue;
        }
        const [x, x2] = xRange;
        const [y, y2] = yRange;
        const geometry = getLinkGeometry(
            [x - coordsX, coordsY2 - y],
            [x2 - coordsX, coordsY2 - y2],
            viewport,
            properties
        );
        for (const point of geometry.points) {
            point[0] += coordsX;
            point[1] = coordsY2 - point[1];
        }
        const points = geometry.points;
        const strokeWidth = encodeNumber(encoders.size, datum);
        if (
            !intersectsBounds(
                visibleBounds,
                Math.min(...points.map((point) => point[0])),
                Math.min(...points.map((point) => point[1])),
                Math.max(...points.map((point) => point[0])),
                Math.max(...points.map((point) => point[1])),
                strokeWidth / 2
            )
        ) {
            continue;
        }

        instanceCount++;
        visitor({ datum, geometry, strokeWidth });
    }
    return instanceCount;
}
