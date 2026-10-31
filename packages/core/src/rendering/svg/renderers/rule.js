import { createSvgElement } from "../svgElement.js";
import {
    resolveRuleProperties,
    visitRuleInstances,
} from "../../immediate/marks/rule.js";
import { encodeNumber, toPaintString } from "../../immediate/markEncoding.js";
import { createSvgAttributeEncoder } from "../svgAttributes.js";
import { formatSvgNumber } from "../svgNumber.js";

/**
 * @param {import("../../../marks/mark.js").default} baseMark
 * @param {import("../svgViewRenderingContext.js").SvgMarkRenderingOptions} options
 */
export function renderRuleSvg(baseMark, options) {
    const mark = /** @type {import("../../../marks/rule.js").default} */ (
        baseMark
    );
    const properties = resolveRuleProperties(mark);
    const { coords, data, group, viewOpacity, visibleBounds } = options;
    const encoders =
        /** @type {Record<string, import("../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const strokeDash = mark.properties.strokeDash;
    const encodeStyles = createSvgAttributeEncoder(group, {
        stroke: { encoder: encoders.color, transform: toPaintString },
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
            if (
                properties.outlineWidth > 0 &&
                toPaintString(encoders.color(instance.datum)) == "none"
            )
                return;
            const positions = {
                x1: formatSvgNumber(instance.x1),
                y1: formatSvgNumber(instance.y1),
                x2: formatSvgNumber(instance.x2),
                y2: formatSvgNumber(instance.y2),
            };
            const line = createSvgElement("line", {
                ...positions,
                ...encodeStyles(instance.datum),
            });
            if (properties.outlineWidth > 0) {
                // Isolate opacity per rule while preserving datum paint order.
                const pair = createSvgElement("g", {
                    opacity:
                        encodeNumber(encoders.opacity, instance.datum) *
                        viewOpacity,
                    "stroke-opacity": 1,
                });
                pair.appendChild(
                    createSvgElement("line", {
                        ...positions,
                        stroke: properties.outlineColor,
                        "stroke-width": formatSvgNumber(instance.outerWidth),
                    })
                );
                line.setAttribute("stroke-opacity", "1");
                pair.appendChild(line);
                group.appendChild(pair);
            } else {
                group.appendChild(line);
            }
        }
    );
}
