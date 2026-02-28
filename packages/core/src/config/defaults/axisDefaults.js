/** @type {import("../../spec/config.js").AxisConfig} */
export const AXIS_DEFAULTS = {
    values: null,

    minExtent: 20,
    maxExtent: Infinity,
    offset: 0,

    domain: true,
    domainWidth: 1,
    domainColor: "gray",
    domainDash: null,
    domainDashOffset: 0,
    domainCap: "square",

    ticks: true,
    tickSize: 5,
    tickWidth: 1,
    tickColor: "gray",
    tickDash: null,
    tickDashOffset: 0,
    tickCap: "square",

    tickCount: null,
    tickMinStep: null,

    labels: true,
    labelAlign: "center",
    labelBaseline: "middle",
    labelPadding: 4,
    labelFontSize: 10,
    labelLimit: 180,
    labelColor: "black",
    format: null,

    titleColor: "black",
    titleFont: "sans-serif",
    titleFontSize: 10,
    titlePadding: 3,

    grid: false,
    gridCap: "butt",
    gridColor: "lightgray",
    gridDash: null,
    gridOpacity: 1,
    gridWidth: 1,
};

/** @type {import("../../spec/config.js").AxisConfig} */
export const LOCUS_AXIS_DEFAULTS = {
    chromTicks: true,
    chromTickSize: 18,
    chromTickWidth: 1,
    chromTickColor: "#989898",
    chromTickDash: [4, 2],
    chromTickDashOffset: 1,

    chromLabels: true,
    chromLabelFontSize: 13,
    chromLabelFontWeight: "normal",
    chromLabelFontStyle: "normal",
    chromLabelColor: "black",
    chromLabelAlign: "left",
    chromLabelPadding: 7,

    chromGrid: false,
    chromGridCap: "butt",
    chromGridColor: "gray",
    chromGridDash: [1, 5],
    chromGridOpacity: 1,
    chromGridWidth: 1,
};
