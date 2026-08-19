import { createSvgElement } from "../svgElement.js";
import {
    resolvePointProperties,
    visitPointInstances,
} from "../../immediate/marks/point.js";
import { tracePointPath } from "../../immediate/geometry/pointPath.js";
import {
    encodeNumber,
    resolveMarkProperty,
    toPaintString,
} from "../../immediate/markEncoding.js";
import { createSvgAttributeEncoder } from "../svgAttributes.js";
import { formatSvgNumber } from "../svgNumber.js";

/**
 * @param {import("../../../marks/mark.js").default} baseMark
 * @param {import("../svgViewRenderingContext.js").SvgMarkRenderingOptions} options
 */
export function renderPointSvg(baseMark, options) {
    const mark = /** @type {import("../../../marks/point.js").default} */ (
        baseMark
    );
    const fillGradientStrength = resolveMarkProperty(
        mark,
        mark.properties.fillGradientStrength
    );
    if (fillGradientStrength) {
        options.warn(
            "SVG export ignored unsupported point property fillGradientStrength."
        );
    }
    if (mark.properties.geometricZoomBound) {
        options.warn(
            "SVG export ignored unsupported point property geometricZoomBound."
        );
    }
    const properties = resolvePointProperties(mark);
    const { inwardStroke } = properties;

    const { group, viewOpacity } = options;
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
    const pointPathBuilder = createPointPathBuilder();
    return visitPointInstances(mark, properties, options, (instance) => {
        if (options.countOnly) {
            return;
        }
        const {
            datum,
            shape,
            x,
            y,
            geometryRadius,
            angle,
            strokeWidth,
            lineShape,
        } = instance;
        const styles = {
            ...encodeStyles(datum),
            ...(inwardStroke && !lineShape
                ? { "stroke-width": formatSvgNumber(strokeWidth) }
                : {}),
            ...(lineShape
                ? getLineShapeStyles(encoders, datum, viewOpacity)
                : {}),
        };
        const element = createPointElement(
            shape,
            x,
            y,
            geometryRadius,
            styles,
            pointPathBuilder
        );
        if (!element) {
            options.warn(
                `SVG export rendered unsupported point shape "${shape}" as a circle.`
            );
            group.appendChild(
                createSvgElement("circle", {
                    cx: formatSvgNumber(x),
                    cy: formatSvgNumber(y),
                    r: formatSvgNumber(geometryRadius),
                    ...styles,
                })
            );
        } else {
            if (angle) {
                element.setAttribute(
                    "transform",
                    `rotate(${formatSvgNumber(angle)} ${formatSvgNumber(x)} ${formatSvgNumber(y)})`
                );
            }
            group.appendChild(element);
        }
    });
}

/**
 * @param {string} shape
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @param {Record<string, string | number>} styles
 * @param {{build: (shape: string, x: number, y: number, radius: number) => string | undefined}} pointPathBuilder
 * @returns {SVGElement | undefined}
 */
function createPointElement(shape, x, y, radius, styles, pointPathBuilder) {
    const cx = formatSvgNumber(x);
    const cy = formatSvgNumber(y);
    const r = formatSvgNumber(radius);

    if (shape == "circle") {
        return createSvgElement("circle", { cx, cy, r, ...styles });
    } else if (shape == "square") {
        return createSvgElement("rect", {
            x: formatSvgNumber(x - radius),
            y: formatSvgNumber(y - radius),
            width: formatSvgNumber(radius * 2),
            height: formatSvgNumber(radius * 2),
            ...styles,
        });
    }

    const path = pointPathBuilder.build(shape, x, y, radius);
    return path ? createSvgElement("path", { d: path, ...styles }) : undefined;
}

/**
 * @returns {{build: (shape: string, x: number, y: number, radius: number) => string | undefined}}
 */
function createPointPathBuilder() {
    let pathData = "";
    const point = (/** @type {number} */ x, /** @type {number} */ y) =>
        `${formatSvgNumber(x)} ${formatSvgNumber(y)}`;
    const sink = {
        moveTo(/** @type {number} */ x, /** @type {number} */ y) {
            pathData += `${pathData ? " M" : "M"} ${point(x, y)}`;
        },
        lineTo(/** @type {number} */ x, /** @type {number} */ y) {
            pathData += ` L ${point(x, y)}`;
        },
        closePath() {
            pathData += " Z";
        },
    };

    return {
        build(shape, x, y, radius) {
            pathData = "";
            return tracePointPath(shape, x, y, radius, sink)
                ? pathData
                : undefined;
        },
    };
}

/**
 * @param {Record<string, import("../../../types/encoder.js").Encoder>} encoders
 * @param {object} datum
 * @param {number} viewOpacity
 * @returns {Record<string, string | number>}
 */
function getLineShapeStyles(encoders, datum, viewOpacity) {
    const stroke = encoders.stroke(datum);
    const strokeOpacity = encodeNumber(encoders.strokeOpacity, datum);
    const useFill = stroke == null || strokeOpacity <= 0;
    return {
        fill: "none",
        stroke: toPaintString(useFill ? encoders.fill(datum) : stroke),
        "stroke-opacity":
            (useFill
                ? encodeNumber(encoders.fillOpacity, datum)
                : strokeOpacity) * viewOpacity,
        "stroke-width": formatSvgNumber(
            encodeNumber(encoders.strokeWidth, datum)
        ),
        "stroke-linecap": "butt",
    };
}
