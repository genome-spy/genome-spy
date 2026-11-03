import { rulePath } from "../rulePath.js";
import {
    encodeNumber,
    resolveMarkProperty,
} from "../../immediate/markEncoding.js";
import { createSvgElement } from "../svgElement.js";
import {
    resolveRuleProperties,
    visitRuleInstances,
} from "../../immediate/marks/rule.js";
import { toPaintString } from "../../immediate/markEncoding.js";
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
    const isRule = mark.getType() === "rule";
    const cap = resolveMarkProperty(mark, mark.properties.strokeCap);
    const strokeDash = resolveMarkProperty(mark, mark.properties.strokeDash);
    const dashOffset = resolveMarkProperty(
        mark,
        mark.properties.strokeDashOffset
    );
    const encodeStyles = createSvgAttributeEncoder(group, {
        stroke: { encoder: encoders.fill, transform: toPaintString },
        "stroke-width": {
            encoder: encoders.size,
            transform: (value) => formatSvgNumber(+value),
        },
    });
    group.setAttribute("stroke-linecap", cap);
    if (strokeDash) {
        group.setAttribute(
            "stroke-dasharray",
            strokeDash.map(formatSvgNumber).join(" ")
        );
        group.setAttribute(
            "stroke-dashoffset",
            "" + formatSvgNumber(dashOffset)
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
            const fillOpacity = isRule
                ? encodeNumber(encoders.fillOpacity, instance.datum)
                : 1;
            if (instance.strokeWidth > 0) {
                const length = Math.hypot(
                    instance.x2 - instance.x1,
                    instance.y2 - instance.y1
                );
                const path = rulePath(
                    length,
                    formatSvgNumber(instance.size),
                    cap,
                    strokeDash,
                    dashOffset
                );
                const paints = createSvgElement("g", {
                    transform: `translate(${formatSvgNumber(instance.x1)} ${formatSvgNumber(instance.y1)}) rotate(${formatSvgNumber((Math.atan2(instance.y2 - instance.y1, instance.x2 - instance.x1) * 180) / Math.PI)})`,
                    opacity:
                        encodeNumber(encoders.opacity, instance.datum) *
                        viewOpacity,
                    "stroke-dasharray": "none",
                    "stroke-opacity": 1,
                });
                paints.append(
                    createSvgElement("path", {
                        d: path,
                        fill: "none",
                        stroke: instance.stroke,
                        "stroke-width": 2 * instance.strokeWidth,
                        "stroke-opacity": instance.strokeOpacity,
                        "stroke-linejoin": "round",
                        mask: options.getRuleStrokeMaskUrl(
                            path,
                            length,
                            instance.size / 2,
                            instance.strokeWidth + 1
                        ),
                    }),
                    createSvgElement("path", {
                        d: path,
                        fill: toPaintString(encoders.fill(instance.datum)),
                        "fill-opacity": fillOpacity,
                        stroke: "none",
                    })
                );
                group.appendChild(paints);
                return;
            }
            group.appendChild(
                createSvgElement("line", {
                    x1: formatSvgNumber(instance.x1),
                    y1: formatSvgNumber(instance.y1),
                    x2: formatSvgNumber(instance.x2),
                    y2: formatSvgNumber(instance.y2),
                    ...encodeStyles(instance.datum),
                    "stroke-opacity":
                        encodeNumber(encoders.opacity, instance.datum) *
                        viewOpacity *
                        fillOpacity,
                })
            );
        }
    );
}
