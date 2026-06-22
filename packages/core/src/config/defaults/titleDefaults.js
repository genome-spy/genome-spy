/** @type {import("../../spec/config.js").TitleConfig} */
export const TITLE_DEFAULTS = {
    anchor: "middle",
    frame: "group",
    offset: 10,
    orient: "top",
    reserve: true,
    align: undefined,
    angle: 0,
    baseline: "alphabetic",
    dx: 0,
    dy: 0,
    color: undefined,
    font: undefined,
    fontSize: 13,
    fontStyle: "normal",
    fontWeight: "normal",
    subtitlePadding: 3,
};

/** @type {import("../../spec/config.js").StyleConfig} */
const OVERLAY_TITLE_STYLE = {
    orient: "top",
    frame: "group",
    reserve: false,
    anchor: "start",
    align: "left",
    baseline: "top",
    offset: -10,
    dx: 10,
    fontSize: 12,
};

/** @type {Record<string, import("../../spec/config.js").StyleConfig>} */
export const TITLE_STYLE_DEFAULTS = {
    "group-title": {},
    "track-title": {
        orient: "left",
        frame: "group",
        reserve: true,
        anchor: "middle",
        align: "right",
        baseline: "middle",
        angle: 0,
        fontSize: 12,
    },
    // Legacy name kept for backward compatibility. Prefer "overlay-title".
    overlay: OVERLAY_TITLE_STYLE,
    "overlay-title": OVERLAY_TITLE_STYLE,
    "group-subtitle": {
        fontSize: 11,
        fontStyle: "normal",
        fontWeight: "normal",
    },
};
