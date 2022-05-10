import { isString } from "vega-util";

/** @type {Omit<Required<import("../spec/title").Title>, "text" | "style">} */
const BASE_TITLE_STYLE = {
    anchor: "middle",
    frame: "group",
    offset: 0,
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

/** @type {Partial<import("../spec/title").Title>} */
const TRACK_TITLE_STYLE = {
    orient: "left",
    anchor: "middle",
    angle: 0,
    dx: -10,
    dy: 0,
    align: "right",
    baseline: "middle",
    fontSize: 12,
};

/** @type {Record<import("../spec/title").TitleAnchor, number>} */
const ANCHORS = {
    start: 0,
    middle: 0.5,
    end: 1,
};

/** @type {Record<import("../spec/title").TitleAnchor, import("../spec/font").Align>} */
const ANCHOR_TO_ALIGN = {
    start: "left",
    middle: "center",
    end: "right",
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

    const anchorPos = ANCHORS[titleSpec.anchor ?? "middle"];

    switch (orient) {
        case "top":
            xy = { x: anchorPos, y: 1 };
            orientConfig = { dy: -10, baseline: "alphabetic", angle: 0 };
            break;
        case "right":
            xy = { x: 1, y: 1 - anchorPos };
            orientConfig = { dy: -10, baseline: "alphabetic", angle: 90 };
            break;
        case "bottom":
            xy = { x: anchorPos, y: 0 };
            orientConfig = { dy: 10, baseline: "top", angle: 0 };
            break;
        case "left":
            xy = { x: 0, y: anchorPos };
            orientConfig = { dy: -10, baseline: "alphabetic", angle: -90 };
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

            align: spec.align ?? ANCHOR_TO_ALIGN[spec.anchor],
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
