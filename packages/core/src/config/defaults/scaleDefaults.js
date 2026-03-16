/** @type {import("../../spec/config.js").ScaleConfig} */
export const SCALE_DEFAULTS = {
    nominalColorScheme: "tableau10",
    ordinalColorScheme: "blues",
    quantitativeColorScheme: "viridis",
    // TODO: If GenomeSpy adopts Vega-Lite-like discrete positional scale
    // inference, add the corresponding default padding knobs here as config
    // defaults, e.g. pointPadding, bandPaddingInner, bandPaddingOuter,
    // rectBandPaddingInner, tickBandPaddingInner, and barBandPaddingInner for
    // the future rect-backed "bar" mark.
};

/** @type {import("../../spec/config.js").RangeConfig} */
export const RANGE_DEFAULTS = {
    shape: ["circle", "square", "triangle-up", "cross", "diamond"],
    size: [0, 400],
    angle: [0, 360],
};
