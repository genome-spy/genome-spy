/** @type {import("../../spec/config.js").ScaleConfig} */
export const SCALE_DEFAULTS = {
    nominalColorScheme: "tableau10",
    ordinalColorScheme: "blues",
    quantitativeColorScheme: "viridis",
    quantitativeHeatmapColorScheme: "viridis",
    quantitativeRampColorScheme: "viridis",
    indexColorScheme: "viridis",
    locusColorScheme: "viridis",
};

/** @type {import("../../spec/config.js").RangeConfig} */
export const RANGE_DEFAULTS = {
    shape: ["circle", "square", "triangle-up", "cross", "diamond"],
    size: [0, 400],
    angle: [0, 360],
};
