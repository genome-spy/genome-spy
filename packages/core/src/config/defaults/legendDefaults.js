/**
 * Initial legend defaults are adapted from Vega:
 * https://github.com/vega/vega/
 *
 * @type {import("../../spec/legend.js").LegendConfig}
 */
export const LEGEND_DEFAULTS = {
    disable: false,
    orient: "right",
    direction: "vertical",
    offset: 18,
    padding: 0,
    spacing: 10,
    columnPadding: 10,
    rowPadding: 2,
    labelAlign: "left",
    labelBaseline: "middle",
    labelLimit: 160,
    labelOffset: 4,
    symbolType: "circle",
    symbolSize: 100,
    symbolOffset: 0,
    symbolStrokeWidth: 1.5,
    symbolBaseFillColor: "transparent",
    symbolBaseStrokeColor: "#888",
    titleLimit: 180,
    titleOrient: "top",
    titlePadding: 5,
};

/** @type {Record<string, import("../../spec/config.js").StyleConfig>} */
export const LEGEND_STYLE_DEFAULTS = {
    "track-bottom": {
        orient: "bottom",
        titleOrient: "left",
        spacing: 3,
        offset: 3,
    },
};
