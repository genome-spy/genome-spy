import {
    encodeNumber,
    resolveMarkProperty,
} from "../../../immediate/markEncoding.js";
import {
    resolveArrowProperties,
    visitArrowHeadPositions,
    visitArrowSkeletonInstances,
} from "../../../immediate/marks/arrow.js";
import {
    resolveLinkProperties,
    visitLinkInstances,
} from "../../../immediate/marks/link.js";
import {
    resolvePointProperties,
    visitPointInstances,
} from "../../../immediate/marks/point.js";
import {
    resolveRectProperties,
    visitRectInstances,
} from "../../../immediate/marks/rect.js";
import {
    resolveRuleProperties,
    visitRuleInstances,
} from "../../../immediate/marks/rule.js";
import {
    resolveTextProperties,
    visitTextInstances,
} from "../../../immediate/marks/text.js";

const MIN_RULE_PICKING_WIDTH = 1;

/**
 * @typedef {object} SoftwarePickingMarkRenderingOptions
 * @prop {import("../softwarePickingRasterizer.js").default} rasterizer
 * @prop {import("../../../../view/layout/rectangle.js").default} coords
 * @prop {object[]} data
 * @prop {import("../../../immediate/bounds.js").RenderBounds} visibleBounds
 * @prop {import("../../../immediate/bounds.js").RenderBounds} anchorCullBounds
 * @prop {number} viewOpacity
 */

/**
 * @param {import("../../../../marks/mark.js").default} mark
 * @param {SoftwarePickingMarkRenderingOptions} options
 * @returns {number}
 */
export function renderMarkSoftwarePicking(mark, options) {
    const type = mark.getType();
    if (type == "arrow") {
        return renderArrow(mark, options);
    } else if (type == "rect") {
        return renderRect(mark, options);
    } else if (type == "point") {
        return renderPoint(mark, options);
    } else if (type == "rule" || type == "tick") {
        return renderRule(mark, options);
    } else if (type == "link") {
        return renderLink(mark, options);
    } else if (type == "text") {
        return renderText(mark, options);
    } else {
        return 0;
    }
}

/** @param {import("../../../../marks/mark.js").default} mark */
export function isSoftwarePickingMarkSupported(mark) {
    const type = mark.getType();
    return (
        type == "rect" ||
        type == "arrow" ||
        type == "point" ||
        type == "rule" ||
        type == "tick" ||
        type == "link" ||
        type == "text"
    );
}

/**
 * @param {import("../../../../marks/mark.js").default} baseMark
 * @param {SoftwarePickingMarkRenderingOptions} options
 */
function renderArrow(baseMark, options) {
    const mark = /** @type {import("../../../../marks/arrow.js").default} */ (
        baseMark
    );
    const properties = resolveArrowProperties(mark);
    const headQuad = Array(8).fill(0);
    return visitArrowSkeletonInstances(
        mark,
        properties,
        options,
        (instance) => {
            const id = getPickingId(mark, instance.datum);
            const strokePadding = instance.strokeWidth / 2;
            if (properties.stem) {
                options.rasterizer.strokeSegment(
                    id,
                    instance.tail.x,
                    instance.tail.y,
                    instance.tip.x,
                    instance.tip.y,
                    instance.stemHalfWidth * 2 + instance.strokeWidth
                );
            }
            visitArrowHeadPositions(instance, (tipX, tipY) => {
                const halfWidth = instance.headHalfWidth + strokePadding;
                const frontX = tipX + instance.tangent.x * strokePadding;
                const frontY = tipY + instance.tangent.y * strokePadding;
                const backDistance =
                    instance.headRepeatFootprint + strokePadding;
                const backX = tipX - instance.tangent.x * backDistance;
                const backY = tipY - instance.tangent.y * backDistance;
                setOrientedQuad(
                    headQuad,
                    frontX,
                    frontY,
                    backX,
                    backY,
                    instance.normal.x,
                    instance.normal.y,
                    halfWidth
                );
                options.rasterizer.fillConvexPolygon(id, headQuad);
            });
        }
    );
}

/**
 * @param {import("../../../../marks/mark.js").default} baseMark
 * @param {SoftwarePickingMarkRenderingOptions} options
 */
function renderRect(baseMark, options) {
    const mark = /** @type {import("../../../../marks/rect.js").default} */ (
        baseMark
    );
    return visitRectInstances(
        mark,
        resolveRectProperties(mark),
        options,
        (instance) =>
            options.rasterizer.fillRect(
                getPickingId(mark, instance.datum),
                instance.x,
                instance.y,
                instance.width,
                instance.height
            )
    );
}

/**
 * @param {import("../../../../marks/mark.js").default} baseMark
 * @param {SoftwarePickingMarkRenderingOptions} options
 */
function renderPoint(baseMark, options) {
    const mark = /** @type {import("../../../../marks/point.js").default} */ (
        baseMark
    );
    const minPickingSize = resolveMarkProperty(
        mark,
        mark.properties.minPickingSize
    );
    return visitPointInstances(
        mark,
        resolvePointProperties(mark),
        options,
        (instance) =>
            options.rasterizer.fillSquare(
                getPickingId(mark, instance.datum),
                instance.x,
                instance.y,
                Math.max(instance.boundsRadius, minPickingSize / 2)
            )
    );
}

/**
 * @param {import("../../../../marks/mark.js").default} baseMark
 * @param {SoftwarePickingMarkRenderingOptions} options
 */
function renderRule(baseMark, options) {
    const mark = /** @type {import("../../../../marks/rule.js").default} */ (
        baseMark
    );
    return visitRuleInstances(
        mark,
        resolveRuleProperties(mark),
        options,
        (instance) =>
            options.rasterizer.strokeSegment(
                getPickingId(mark, instance.datum),
                instance.x1,
                instance.y1,
                instance.x2,
                instance.y2,
                Math.max(instance.strokeWidth, MIN_RULE_PICKING_WIDTH)
            )
    );
}

/**
 * @param {import("../../../../marks/mark.js").default} baseMark
 * @param {SoftwarePickingMarkRenderingOptions} options
 */
function renderLink(baseMark, options) {
    const mark = /** @type {import("../../../../marks/link.js").default} */ (
        baseMark
    );
    const minPickingSize = resolveMarkProperty(
        mark,
        mark.properties.minPickingSize
    );
    return visitLinkInstances(
        mark,
        resolveLinkProperties(mark),
        options,
        (instance) => {
            const [p1, p2, p3, p4] = instance.points;
            options.rasterizer.strokeCubic(
                getPickingId(mark, instance.datum),
                p1[0],
                p1[1],
                p2[0],
                p2[1],
                p3[0],
                p3[1],
                p4[0],
                p4[1],
                Math.max(instance.strokeWidth, minPickingSize)
            );
        }
    );
}

/**
 * @param {import("../../../../marks/mark.js").default} baseMark
 * @param {SoftwarePickingMarkRenderingOptions} options
 */
function renderText(baseMark, options) {
    const mark = /** @type {import("../../../../marks/text.js").default} */ (
        baseMark
    );
    return visitTextInstances(
        mark,
        resolveTextProperties(mark),
        options,
        (instance) =>
            options.rasterizer.fillConvexPolygon(
                getPickingId(mark, instance.datum),
                instance.boundsQuad
            )
    );
}

/**
 * @param {number[]} target
 * @param {number} frontX
 * @param {number} frontY
 * @param {number} backX
 * @param {number} backY
 * @param {number} normalX
 * @param {number} normalY
 * @param {number} halfWidth
 */
function setOrientedQuad(
    target,
    frontX,
    frontY,
    backX,
    backY,
    normalX,
    normalY,
    halfWidth
) {
    const offsetX = normalX * halfWidth;
    const offsetY = normalY * halfWidth;
    target[0] = frontX + offsetX;
    target[1] = frontY + offsetY;
    target[2] = backX + offsetX;
    target[3] = backY + offsetY;
    target[4] = backX - offsetX;
    target[5] = backY - offsetY;
    target[6] = frontX - offsetX;
    target[7] = frontY - offsetY;
}

/**
 * @param {import("../../../../marks/mark.js").default} mark
 * @param {object} datum
 */
function getPickingId(mark, datum) {
    const encoders =
        /** @type {Record<string, import("../../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    return encodeNumber(encoders.uniqueId, datum);
}
