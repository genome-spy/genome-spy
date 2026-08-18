import { createSvgElement } from "../svgElement.js";
import {
    resolveRuleProperties,
    visitRuleInstances,
} from "../../rendering/cpu/rule.js";
import {
    createSvgAttributeEncoder,
    formatSvgNumber,
    toSvgString,
} from "../svgMarkUtils.js";

/**
 * @param {import("../../marks/mark.js").default} baseMark
 * @param {import("../svgViewRenderingContext.js").SvgMarkRenderingOptions} options
 */
export function renderRuleSvg(baseMark, options) {
    const mark = /** @type {import("../../marks/rule.js").default} */ (
        baseMark
    );
    const properties = resolveRuleProperties(mark);
    const { coords, data, group, viewOpacity, visibleBounds } = options;
    const encoders =
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const strokeDash = mark.properties.strokeDash;
    const encodeStyles = createSvgAttributeEncoder(group, {
        stroke: { encoder: encoders.color, transform: toSvgString },
        "stroke-opacity": {
            encoder: encoders.opacity,
            transform: (value) => +value * viewOpacity,
        },
        "stroke-width": {
            encoder: encoders.size,
            transform: (value) => formatSvgNumber(+value),
        },
    });
    group.setAttribute("stroke-linecap", "" + mark.properties.strokeCap);
    if (strokeDash) {
        group.setAttribute(
            "stroke-dasharray",
            strokeDash.map(formatSvgNumber).join(" ")
        );
        group.setAttribute(
            "stroke-dashoffset",
            "" + formatSvgNumber(mark.properties.strokeDashOffset)
        );
    }
    return visitRuleInstances(
        mark,
        properties,
        { coords, data, visibleBounds },
        (instance) => {
            if (options.countOnly) {
                return;
            }
            group.appendChild(
                createSvgElement("line", {
                    x1: formatSvgNumber(instance.x1),
                    y1: formatSvgNumber(instance.y1),
                    x2: formatSvgNumber(instance.x2),
                    y2: formatSvgNumber(instance.y2),
                    ...encodeStyles(instance.datum),
                })
            );
        }
    );
}
