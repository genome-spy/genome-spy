/** @type {import("../../spec/config.js").TitleConfig} */
export const TITLE_DEFAULTS = {
    anchor: "middle",
    frame: "group",
    offset: 10,
    orient: "top",
    align: undefined,
    angle: 0,
    baseline: "alphabetic",
    dx: 0,
    dy: 0,
    color: undefined,
    font: undefined,
    fontSize: 12,
    fontStyle: "normal",
    fontWeight: "normal",
};

/** @type {Record<string, import("../../spec/config.js").StyleConfig>} */
export const TITLE_STYLE_DEFAULTS = {
    "track-title": {
        orient: "left",
        anchor: "middle",
        align: "right",
        baseline: "middle",
        angle: 0,
        fontSize: 12,
    },
    overlay: {
        orient: "top",
        anchor: "start",
        align: "left",
        baseline: "top",
        offset: -10,
        dx: 10,
        fontSize: 12,
    },
    "overlay-title": {
        orient: "top",
        anchor: "start",
        align: "left",
        baseline: "top",
        offset: -10,
        dx: 10,
        fontSize: 12,
    },
};
