export const DEFAULT_GRADIENT_OPACITY = 1;
export const DEFAULT_GRADIENT_STROKE_WIDTH = 0;
export const DEFAULT_GRADIENT_THICKNESS = 12;
export const DEFAULT_GRADIENT_TICK_COUNT = 5;

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
    gradientThickness: DEFAULT_GRADIENT_THICKNESS,
    gradientOpacity: DEFAULT_GRADIENT_OPACITY,
    gradientStrokeWidth: DEFAULT_GRADIENT_STROKE_WIDTH,
    tickCount: DEFAULT_GRADIENT_TICK_COUNT,
    // Shape and stroke width fall back in the generated symbol mark so that
    // only author-configured legend properties override inherited styling.
    symbolSize: 100,
    symbolOffset: 0,
    symbolBaseFillColor: "transparent",
    symbolBaseStrokeColor: "#888",
    titleLimit: 180,
    titleOrient: "top",
    titlePadding: 5,
};

/** @type {import("../../spec/config.js").StyleConfig} */
const TRACK_BOTTOM_LEGEND_STYLE = {
    orient: "bottom",
    direction: "horizontal",
    titleOrient: "left",
    spacing: 15,
    offset: 3,
};

/** @type {Record<string, import("../../spec/config.js").StyleConfig>} */
export const LEGEND_STYLE_DEFAULTS = {
    "track-bottom-legend": TRACK_BOTTOM_LEGEND_STYLE,
    // Deprecated compatibility alias. TODO: Remove "track-bottom" in the next breaking release.
    "track-bottom": TRACK_BOTTOM_LEGEND_STYLE,
};

/**
 * @type {import("../../spec/legend.js").LegendConfig}
 */
export const LEGEND_TRACK_DEFAULTS = {
    style: "track-bottom-legend",
};
