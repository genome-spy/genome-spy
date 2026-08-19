import {
    resolveArrowProperties,
    visitArrowInstances,
} from "../../immediate/marks/arrow.js";
import { createSvgElement } from "../svgElement.js";
import { toPaintString } from "../../immediate/markEncoding.js";
import { createSvgAttributeEncoder } from "../svgAttributes.js";
import { formatSvgNumber } from "../svgNumber.js";

/**
 * @param {import("../../../marks/mark.js").default} baseMark
 * @param {import("../svgViewRenderingContext.js").SvgMarkRenderingOptions} options
 */
export function renderArrowSvg(baseMark, options) {
    const mark = /** @type {import("../../../marks/arrow.js").default} */ (
        baseMark
    );
    const { coords, data, group, viewOpacity, visibleBounds } = options;
    const encoders =
        /** @type {Record<string, import("../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const encodeStyles = createSvgAttributeEncoder(group, {
        fill: { encoder: encoders.fill, transform: toPaintString },
        "fill-opacity": {
            encoder: encoders.fillOpacity,
            transform: (value) => +value * viewOpacity,
        },
        stroke: { encoder: encoders.stroke, transform: toPaintString },
        "stroke-opacity": {
            encoder: encoders.strokeOpacity,
            transform: (value) => +value * viewOpacity,
        },
        "stroke-width": {
            encoder: encoders.strokeWidth,
            transform: (value) => formatSvgNumber(+value),
        },
    });
    group.setAttribute("stroke-linejoin", "miter");
    const properties = resolveArrowProperties(mark);

    return visitArrowInstances(
        mark,
        properties,
        {
            coords,
            data,
            visibleBounds,
            viewOpacity,
            countOnly: options.countOnly,
        },
        (instance) => {
            if (options.countOnly) {
                return;
            }
            if (instance.headShapeFallback) {
                options.warn(
                    `SVG export rendered unsupported arrow headShape "${properties.headShape}" as a triangle.`
                );
            }
            group.appendChild(
                createSvgElement("path", {
                    d: instance.boundaryLoops.map(polygon).join(" "),
                    ...encodeStyles(instance.datum),
                })
            );
        }
    );
}

/** @param {{x: number, y: number}[]} points */
function polygon(points) {
    return `M ${points.map(point).join(" L ")} Z`;
}

/** @param {{x: number, y: number}} value */
function point(value) {
    return `${formatSvgNumber(value.x)} ${formatSvgNumber(value.y)}`;
}
