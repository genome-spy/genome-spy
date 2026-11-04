import { createSvgElement } from "../svgElement.js";
import {
    resolvePointProperties,
    visitPointInstances,
} from "../../immediate/marks/point.js";
import { tracePointPath } from "../../immediate/geometry/pointPath.js";
import {
    encodeNumber,
    getPaintOpacityAccessor,
    resolveMarkProperty,
    toPaintString,
} from "../../immediate/markEncoding.js";
import { createSvgAttributeEncoder } from "../svgAttributes.js";
import { formatSvgNumber, formatSvgUnitless } from "../svgNumber.js";

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
    const fillAlpha = getPaintOpacityAccessor(encoders.fill);
    const strokeAlpha = getPaintOpacityAccessor(encoders.stroke);
    const encodeStyles = createSvgAttributeEncoder(group, {
        fill: { encoder: encoders.fill, transform: toPaintString },
        "fill-opacity": {
            encoder: encoders.fillOpacity,
            transform: (value) => +value,
        },
        stroke: { encoder: encoders.stroke, transform: toPaintString },
        "stroke-opacity": {
            encoder: encoders.strokeOpacity,
            transform: (value) => +value,
        },
        "stroke-width": {
            encoder: encoders.strokeWidth,
            transform: (value) => formatSvgNumber(+value),
        },
    });
    const constantFill = group.getAttribute("fill");
    const constantFillOpacity = group.getAttribute("fill-opacity");
    const constantStroke = group.getAttribute("stroke");
    const constantStrokeOpacity = group.getAttribute("stroke-opacity");
    const pointPathBuilder = createPointPathBuilder();
    return visitPointInstances(mark, properties, options, (instance) => {
        if (options.countOnly) {
            return;
        }
        const { datum, radius, geometryRadius, strokeWidth, lineShape } =
            instance;
        /** @type {Record<string, string | number>} */
        const styles = {
            ...encodeStyles(datum),
            ...(inwardStroke && !lineShape
                ? { "stroke-width": formatSvgNumber(strokeWidth) }
                : {}),
            ...(lineShape
                ? getLineShapeStyles(encoders, datum, strokeAlpha)
                : {}),
        };
        // Only inset fill geometry needs the stroke's effective alpha here.
        const strokeOpacity =
            radius == geometryRadius
                ? 0
                : +(styles["stroke-opacity"] ?? constantStrokeOpacity) *
                  strokeAlpha(String(styles.stroke ?? constantStroke));
        const hasStroke = strokeOpacity > 0;
        const separateFill =
            !lineShape &&
            radius != geometryRadius &&
            (!hasStroke || strokeOpacity < 1) &&
            +(styles["fill-opacity"] ?? constantFillOpacity) *
                fillAlpha(String(styles.fill ?? constantFill)) >
                0;

        // A translucent inward stroke uses two shapes for one logical point.
        // Fade that pair together; ordinary and invisible-stroke points stay flat.
        const isolate = separateFill && hasStroke && viewOpacity != 1;
        const occurrence = isolate
            ? createSvgElement("g", { opacity: formatSvgUnitless(viewOpacity) })
            : group;
        if (isolate) {
            group.appendChild(occurrence);
        } else if (viewOpacity != 1) {
            styles.opacity = formatSvgUnitless(viewOpacity);
        }

        if (separateFill) {
            // Preserve the nominal fill without introducing per-point clips.
            occurrence.appendChild(
                createPointElement(
                    instance,
                    radius,
                    { ...styles, stroke: "none" },
                    pointPathBuilder,
                    options.warn
                )
            );
            styles.fill = "none";
        }
        if (!separateFill || hasStroke) {
            occurrence.appendChild(
                createPointElement(
                    instance,
                    geometryRadius,
                    styles,
                    pointPathBuilder,
                    options.warn
                )
            );
        }
    });
}

/**
 * @param {import("../../immediate/marks/point.js").PointInstance} instance
 * @param {number} radius
 * @param {Record<string, string | number>} styles
 * @param {{build: (shape: string, x: number, y: number, radius: number) => string | undefined}} pointPathBuilder
 * @param {(message: string) => void} warn
 * @returns {SVGElement}
 */
function createPointElement(instance, radius, styles, pointPathBuilder, warn) {
    const { shape, x, y, angle } = instance;
    const cx = formatSvgNumber(x);
    const cy = formatSvgNumber(y);
    const r = formatSvgNumber(radius);

    let element;
    if (shape == "circle") {
        element = createSvgElement("circle", { cx, cy, r, ...styles });
    } else if (shape == "square") {
        element = createSvgElement("rect", {
            x: formatSvgNumber(x - radius),
            y: formatSvgNumber(y - radius),
            width: formatSvgNumber(radius * 2),
            height: formatSvgNumber(radius * 2),
            ...styles,
        });
    } else {
        const path = pointPathBuilder.build(shape, x, y, radius);
        if (path) {
            element = createSvgElement("path", { d: path, ...styles });
        } else {
            warn(
                `SVG export rendered unsupported point shape "${shape}" as a circle.`
            );
            element = createSvgElement("circle", { cx, cy, r, ...styles });
        }
    }

    if (angle) {
        element.setAttribute(
            "transform",
            `rotate(${formatSvgNumber(angle)} ${cx} ${cy})`
        );
    }
    return element;
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
 * @param {(paint: string) => number} strokeAlpha
 * @returns {Record<string, string | number>}
 */
function getLineShapeStyles(encoders, datum, strokeAlpha) {
    const stroke = toPaintString(encoders.stroke(datum));
    const strokeOpacity = encodeNumber(encoders.strokeOpacity, datum);
    const useFill = strokeOpacity * strokeAlpha(stroke) <= 0;
    return {
        fill: "none",
        stroke: toPaintString(useFill ? encoders.fill(datum) : stroke),
        "stroke-opacity": useFill
            ? encodeNumber(encoders.fillOpacity, datum)
            : strokeOpacity,
        "stroke-width": formatSvgNumber(
            encodeNumber(encoders.strokeWidth, datum)
        ),
        "stroke-linecap": "butt",
    };
}
