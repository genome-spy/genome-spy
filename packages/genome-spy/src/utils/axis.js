import { validTicks, tickValues, tickFormat, tickCount } from "../scale/ticks";

// Based on: https://vega.github.io/vega-lite/docs/axis.html
/** @type { import("../spec/axis").Axis} */
const defaultAxisProps = {
    /** @type {number[] | string[] | boolean[]} */
    values: null,

    minExtent: 30, // TODO
    maxExtent: Infinity, // TODO
    offset: 0,

    domain: true,
    domainWidth: 1,
    domainColor: "gray",

    ticks: true,
    tickSize: 6,
    tickWidth: 1,
    tickColor: "gray",

    /** @type {number} */
    tickCount: null,
    /** @type {number} */
    tickMinStep: null,

    labels: true,
    labelPadding: 4,
    labelFont: "sans-serif",
    labelFontSize: 10,
    labelLimit: 180, // TODO
    labelColor: "black",
    /** @type { string } */
    format: null,

    titleColor: "black",
    titleFont: "sans-serif",
    titleFontSize: 10,
    titlePadding: 5
};

/**
 *
 * @param {import("../view/resolution").default} resolution
 * @param {number} axisLength
 * @param {function} measureWidth
 * @param {"vertical" | "horizontal"} orientation
 * @param {function} scale
 *
 */
export function createAxisLayout(
    resolution,
    axisLength,
    measureWidth,
    orientation = "vertical",
    scale = undefined
) {
    let pos = 0;

    scale = scale || resolution.getScale();

    const resolutionAxisProps = resolution.getAxisProps();
    if (resolutionAxisProps === null) {
        return;
    }

    /** @type { import("../spec/axis").Axis} */
    const props = {
        ...defaultAxisProps,
        ...resolutionAxisProps
    };

    const axisLayout = {
        offsets: {
            domain: 0,
            ticks: 0,
            labels: 0,
            title: 0
        },
        width: 0,
        /** @type {any[]} */
        ticks: [],
        /** @type {any[]} */
        tickLabels: [],
        /** @type {string} */
        title: undefined,
        scale: scale.copy().range([axisLength, 0]), // TODO: Fix
        props: props
    };

    pos += props.offset;
    axisLayout.offsets.domain = pos;

    // Slightly decrease the tick density as the height increases
    let count =
        props.tickCount || orientation == "vertical"
            ? Math.round(
                  axisLength /
                      Math.exp(axisLength / 800) /
                      props.labelFontSize /
                      1.7
              )
            : Math.round(axisLength / 80); // TODO: Make dynamic

    count = tickCount(scale, count, props.tickMinStep);

    /** @type {array} */
    axisLayout.ticks = props.values
        ? validTicks(scale, props.values, count)
        : tickValues(scale, count);

    // --- Ticks ---

    if (props.ticks) {
        pos += props.tickSize;
        axisLayout.offsets.ticks = pos;
    }

    // --- Labels ---

    if (props.labels) {
        pos += props.labelPadding;
        axisLayout.offsets.labels = pos;

        // TODO:
        // const maxAbs = d3max(scale.domain(), x => Math.abs(x));
        // scale.tickFormat(axisLayout.ticks.length, props.format || (maxAbs < 0.001 || maxAbs > 100000 ? "s" : undefined)) :

        const format = tickFormat(scale, count, props.format);

        axisLayout.tickLabels = axisLayout.ticks.map(format);

        pos +=
            orientation == "vertical"
                ? axisLayout.tickLabels
                      .map(label => measureWidth(label))
                      .reduce((a, b) => Math.max(a, b), 0)
                : props.labelFontSize;
    }

    // --- Title ---

    axisLayout.title = resolution.getTitle();

    if (axisLayout.title) {
        pos += props.titlePadding;
        pos += props.titleFontSize;
        axisLayout.offsets.title = pos;
    }

    axisLayout.width = pos;

    return axisLayout;
}
