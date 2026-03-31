/** @type {import("../../spec/config.js").MarkConfig} */
export const MARK_DEFAULTS = {
    xOffset: 0,
    yOffset: 0,
    minBufferSize: 0,
    opacity: 1.0,
};

/** @type {import("../../spec/config.js").PointConfig} */
export const POINT_MARK_DEFAULTS = {
    x: 0.5,
    y: 0.5,
    filled: true,
    size: 100.0,
    semanticScore: 0.0,
    shape: "circle",
    strokeWidth: 2.0,
    fillGradientStrength: 0.0,
    dx: 0,
    dy: 0,
    angle: 0,
    sampleFacetPadding: 0.1,
    semanticZoomFraction: 0.02,
    minPickingSize: 2.0,
};

/** @type {import("../../spec/config.js").RectConfig} */
export const RECT_MARK_DEFAULTS = {
    x2: undefined,
    y2: undefined,
    filled: true,
    strokeWidth: 3,
    cornerRadius: 0.0,
    minWidth: 0.5,
    minHeight: 0.5,
    minOpacity: 1.0,
};

/** @type {import("../../spec/config.js").RuleConfig} */
export const RULE_MARK_DEFAULTS = {
    x2: undefined,
    y2: undefined,
    size: 1,
    minLength: 0.0,
    strokeDash: null,
    strokeDashOffset: 0,
    strokeCap: "butt",
};

/** @type {import("../../spec/config.js").TickConfig} */
export const TICK_MARK_DEFAULTS = {
    minLength: 0.0,
    strokeDash: null,
    strokeDashOffset: 0,
    strokeCap: "butt",
    orient: undefined,
    thickness: 1,
};

/** @type {import("../../spec/config.js").TextConfig} */
export const TEXT_MARK_DEFAULTS = {
    x: 0.5,
    y: 0.5,
    x2: undefined,
    y2: undefined,
    text: "",
    size: 11.0,
    font: undefined,
    fontStyle: undefined,
    fontWeight: undefined,
    align: "center",
    baseline: "middle",
    dx: 0,
    dy: 0,
    angle: 0,
    fitToBand: false,
    squeeze: true,
    paddingX: 0,
    paddingY: 0,
    flushX: true,
    flushY: true,
    logoLetters: false,
    viewportEdgeFadeWidthTop: 0,
    viewportEdgeFadeWidthRight: 0,
    viewportEdgeFadeWidthBottom: 0,
    viewportEdgeFadeWidthLeft: 0,
    viewportEdgeFadeDistanceTop: -Infinity,
    viewportEdgeFadeDistanceRight: -Infinity,
    viewportEdgeFadeDistanceBottom: -Infinity,
    viewportEdgeFadeDistanceLeft: -Infinity,
};

/** @type {import("../../spec/config.js").LinkConfig} */
export const LINK_MARK_DEFAULTS = {
    x: 0.0,
    x2: undefined,
    y: 0.0,
    y2: undefined,
    size: 1.0,
    segments: 101,
    arcHeightFactor: 1.0,
    minArcHeight: 1.5,
    minPickingSize: 3.0,
    clampApex: false,
    maxChordLength: 50000,
    arcFadingDistance: false,
    noFadingOnPointSelection: true,
    linkShape: "arc",
    orient: "vertical",
};
