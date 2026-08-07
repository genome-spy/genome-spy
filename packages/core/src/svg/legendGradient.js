import { isContinuous } from "vega-scale";
import { createSvgElement } from "./svgElement.js";
import { intersectsSvgBounds } from "./svgBounds.js";
import {
    formatSvgNumber,
    projectXRange,
    projectYRange,
    toSvgString,
} from "./svgMarkUtils.js";
import { formatSvgUnitless } from "./svgNumber.js";

const MAX_GRADIENT_STOP_COUNT = 64;

/**
 * Replaces the sampled rectangles of an internal continuous legend ramp with
 * one SVG gradient. The sampled colors still come from the mark encoders, so
 * non-RGB Vega interpolators are approximated faithfully by dense SVG stops.
 *
 * @param {import("../marks/mark.js").default} mark
 * @param {import("./svgViewRenderingContext.js").SvgMarkRenderingOptions} options
 * @returns {number | undefined} Visible source instance count, or undefined
 *      when the mark is not a continuous legend ramp.
 */
export function renderLegendGradientSvg(mark, options) {
    const params = findLegendGradientParams(mark.unitView);
    if (!params) {
        return undefined;
    }

    const scale = mark.unitView.getScaleResolution(params.channel)?.getScale();
    if (!scale || !isContinuous(scale.type)) {
        return undefined;
    }

    const { coords, data, group, viewOpacity, visibleBounds } = options;
    if (!data.length) {
        return 0;
    }

    const encoders =
        /** @type {Record<string, import("../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const colorEncoder =
        params.channel == "stroke" ? encoders.stroke : encoders.fill;
    const horizontal = hasGradientPositionField(mark.unitView.spec.encoding.x);
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    const stops = data
        .map((datum) => {
            const [x1, x2] = projectXRange(coords, encoders, datum);
            const [y1, y2] = projectYRange(coords, encoders, datum);
            minX = Math.min(minX, x1, x2);
            minY = Math.min(minY, y1, y2);
            maxX = Math.max(maxX, x1, x2);
            maxY = Math.max(maxY, y1, y2);

            return {
                offset: Number(
                    /** @type {{position: number}} */ (datum).position
                ),
                color: toSvgString(colorEncoder(datum)),
            };
        })
        .sort((a, b) => a.offset - b.offset);

    if (!intersectsSvgBounds(visibleBounds, minX, minY, maxX, maxY)) {
        return 0;
    }
    if (options.countOnly) {
        return data.length;
    }

    const sampledStops = sampleGradientStops(stops);
    const gradientStops = [
        { offset: 0, color: sampledStops[0].color },
        ...sampledStops,
        { offset: 1, color: sampledStops.at(-1).color },
    ];
    const fill = options.getLegendGradientUrl({
        x1: minX,
        y1: horizontal ? minY : maxY,
        x2: horizontal ? maxX : minX,
        y2: minY,
        stops: gradientStops,
    });
    const roundedX = formatSvgNumber(minX);
    const roundedY = formatSvgNumber(minY);
    const roundedX2 = formatSvgNumber(maxX);
    const roundedY2 = formatSvgNumber(maxY);
    const fillOpacity = Number(encoders.fillOpacity(data[0])) * viewOpacity;
    group.appendChild(
        createSvgElement("rect", {
            x: roundedX,
            y: roundedY,
            width: formatSvgNumber(roundedX2 - roundedX),
            height: formatSvgNumber(roundedY2 - roundedY),
            fill,
            "fill-opacity": formatSvgUnitless(fillOpacity),
            stroke: "none",
        })
    );
    return data.length;
}

/**
 * SVG interpolates between gradient stops, so retaining every rectangle sample
 * from the WebGL legend would only make the document unnecessarily verbose.
 *
 * @template T
 * @param {T[]} stops
 * @returns {T[]}
 */
function sampleGradientStops(stops) {
    if (stops.length <= MAX_GRADIENT_STOP_COUNT) {
        return stops;
    }

    return Array.from(
        { length: MAX_GRADIENT_STOP_COUNT },
        (_, index) =>
            stops[
                Math.round(
                    (index * (stops.length - 1)) / (MAX_GRADIENT_STOP_COUNT - 1)
                )
            ]
    );
}

/**
 * @param {import("../view/view.js").default} view
 * @returns {import("../spec/data.js").LegendGradientData | undefined}
 */
function findLegendGradientParams(view) {
    /** @type {import("../view/view.js").default | undefined} */
    let current = view;
    while (current) {
        const data = current.spec.data;
        if (data) {
            return "lazy" in data && data.lazy.type == "legendGradient"
                ? data.lazy
                : undefined;
        }
        current = current.dataParent;
    }
    return undefined;
}

/** @param {import("../spec/channel.js").ChannelDef | undefined} channelDef */
function hasGradientPositionField(channelDef) {
    return (
        channelDef != null &&
        "field" in channelDef &&
        (channelDef.field == "position0" || channelDef.field == "position1")
    );
}
