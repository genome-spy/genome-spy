import { intersectsSvgBounds } from "../../svg/svgBounds.js";
import {
    encodeNumber,
    projectXRange,
    projectYRange,
    resolveSvgProperty,
} from "../../svg/svgMarkUtils.js";

/**
 * @typedef {object} RuleInstance
 * @prop {object} datum
 * @prop {number} x1
 * @prop {number} y1
 * @prop {number} x2
 * @prop {number} y2
 * @prop {number} strokeWidth
 */

/** @param {import("../../marks/rule.js").default} mark */
export function resolveRuleProperties(mark) {
    return { minLength: resolveSvgProperty(mark, mark.properties.minLength) };
}

/**
 * @param {import("../../marks/rule.js").default} mark
 * @param {{minLength: number}} properties
 * @param {{coords: import("../../view/layout/rectangle.js").default, data: object[], visibleBounds: import("../../svg/svgBounds.js").SvgBounds}} options
 * @param {(instance: RuleInstance) => void} visitor
 */
export function visitRuleInstances(mark, properties, options, visitor) {
    const { coords, data, visibleBounds } = options;
    const encoders =
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    /** @type {RuleInstance} */
    const instance = {
        datum: {},
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        strokeWidth: 0,
    };
    let instanceCount = 0;

    for (const datum of data) {
        let [x1, x2] = projectXRange(coords, encoders, datum);
        let [y1, y2] = projectYRange(coords, encoders, datum);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.hypot(dx, dy);
        if (length > 0 && length < properties.minLength) {
            const expansion = (properties.minLength - length) / 2;
            const ux = dx / length;
            const uy = dy / length;
            x1 -= ux * expansion;
            y1 -= uy * expansion;
            x2 += ux * expansion;
            y2 += uy * expansion;
        }
        const strokeWidth = encodeNumber(encoders.size, datum);
        if (
            !intersectsSvgBounds(visibleBounds, x1, y1, x2, y2, strokeWidth / 2)
        ) {
            continue;
        }

        instanceCount++;
        instance.datum = datum;
        instance.x1 = x1;
        instance.y1 = y1;
        instance.x2 = x2;
        instance.y2 = y2;
        instance.strokeWidth = strokeWidth;
        visitor(instance);
    }
    return instanceCount;
}
