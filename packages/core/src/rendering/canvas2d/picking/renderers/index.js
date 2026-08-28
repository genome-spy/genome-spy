import {
    encodeNumber,
    resolveMarkProperty,
} from "../../../immediate/markEncoding.js";
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
    if (type == "rect") {
        return renderRect(mark, options);
    } else if (type == "point") {
        return renderPoint(mark, options);
    } else if (type == "rule" || type == "tick") {
        return renderRule(mark, options);
    } else if (type == "link") {
        return renderLink(mark, options);
    } else {
        return 0;
    }
}

/** @param {import("../../../../marks/mark.js").default} mark */
export function isSoftwarePickingMarkSupported(mark) {
    const type = mark.getType();
    return (
        type == "rect" ||
        type == "point" ||
        type == "rule" ||
        type == "tick" ||
        type == "link"
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
