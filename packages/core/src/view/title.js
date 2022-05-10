import { isString } from "vega-util";

/** @type {Omit<Required<import("../spec/title").Title>, "text" | "style">} */
const BASE_TITLE_STYLE = {
    anchor: "start",
    frame: "group",
    offset: 0,
    orient: "top",
    align: "center",
    angle: 0,
    baseline: "alphabetic",
    dx: -10,
    dy: 0,
    color: undefined,
    font: undefined,
    fontSize: 12,
    fontStyle: "normal",
    fontWeight: "normal",
};

/** @type {Partial<import("../spec/title").Title>} */
const TRACK_TITLE_STYLE = {
    orient: "left",
    angle: 0,
    align: "right",
    baseline: "middle",
    fontSize: 12,
};

/**
 * @param {string | import("../spec/title").Title} title
 * @returns {import("../spec/view").UnitSpec}
 */
export default function createTitle(title) {
    if (!title) {
        return;
    }

    /** @type {import("../spec/title").Title} */
    const titleSpec = isString(title) ? { text: title } : title;

    if (!titleSpec.text || titleSpec.orient == "none") {
        return;
    }

    /** @type {Partial<import("../spec/title").Title>} */
    let config;
    switch (titleSpec.style) {
        case "track-title":
            config = TRACK_TITLE_STYLE;
            break;
        default:
            config = {};
    }

    const orient = titleSpec.orient ?? config.orient ?? BASE_TITLE_STYLE.orient;

    /** @type {Partial<import("../spec/title").Title>} */
    let orientConfig = {};
    let xy = { x: 0, y: 0 };

    //const anchors = ["start", "middle", "end"];

    switch (orient) {
        case "top":
            xy = { x: 0.5, y: 1 };
            orientConfig = { dy: -10, baseline: "alphabetic", angle: 0 };
            break;
        case "right":
            xy = { x: 1, y: 0.5 };
            orientConfig = { dx: -10, baseline: "alphabetic", angle: 90 };
            break;
        case "bottom":
            xy = { x: 0.5, y: 0 };
            orientConfig = { dy: 10, baseline: "top", angle: 0 };
            break;
        case "left":
            xy = { x: 0, y: 0.5 };
            orientConfig = { dx: -10, baseline: "alphabetic", angle: -90 };
            break;
        default:
    }

    /** @type {import("../spec/title").Title} */
    const spec = {
        ...BASE_TITLE_STYLE,
        ...orientConfig,
        ...config,
        ...titleSpec,
    };

    // TODO: group, offset

    return {
        configurableVisibility: false,
        data: { values: [{}] },
        mark: {
            type: "text",
            tooltip: null,
            clip: false,
            ...xy,

            text: spec.text,

            align: spec.align,
            angle: spec.angle,
            baseline: spec.baseline,
            dx: spec.dx,
            dy: spec.dy,
            color: spec.color,
            font: spec.font,
            size: spec.fontSize,
            fontStyle: spec.fontStyle,
            fontWeight: spec.fontWeight,
        },
    };
}
