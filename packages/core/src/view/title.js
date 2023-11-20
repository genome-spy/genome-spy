import { isString } from "vega-util";

/** @type {Omit<Required<import("../spec/title.js").Title>, "text" | "style">} */
const BASE_TITLE_STYLE = {
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

/** @type {Partial<import("../spec/title.js").Title>} */
const TRACK_TITLE_STYLE = {
    orient: "left",
    anchor: "middle",
    align: "right",
    baseline: "middle",
    angle: 0,
    fontSize: 12,
};

/** @type {Partial<import("../spec/title.js").Title>} */
const OVERLAY_TITLE_STYLE = {
    orient: "top",
    anchor: "start",
    align: "left",
    baseline: "top",
    offset: -10,
    dx: 10,
    fontSize: 12,
};

/** @type {Record<import("../spec/title.js").TitleAnchor, number>} */
const ANCHORS = {
    start: 0,
    middle: 0.5,
    end: 1,
};

/** @type {Record<import("../spec/title.js").TitleAnchor, import("../spec/font.js").Align>} */
const ANCHOR_TO_ALIGN = {
    start: "left",
    middle: "center",
    end: "right",
};

/**
 * @param {string | import("../spec/title.js").Title} title
 * @returns {import("../spec/view.js").UnitSpec}
 */
export default function createTitle(title) {
    if (!title) {
        return;
    }

    /** @type {import("../spec/title.js").Title} */
    const titleSpec = isString(title) ? { text: title } : title;

    if (!titleSpec.text || titleSpec.orient == "none") {
        return;
    }

    // TODO: Make these configurable
    /** @type {Partial<import("../spec/title.js").Title>} */
    const config =
        {
            "track-title": TRACK_TITLE_STYLE,
            overlay: OVERLAY_TITLE_STYLE,
        }[titleSpec.style] ?? {};

    // TODO: frame prop

    /** @type {import("../spec/title.js").Title} */
    const preliminarySpec = {
        ...BASE_TITLE_STYLE,
        ...config,
        ...titleSpec,
    };

    /** @type {Partial<import("../spec/title.js").Title>} */
    let orientConfig = {};
    let xy = { x: 0, y: 0 };

    const anchorPos = ANCHORS[preliminarySpec.anchor ?? "middle"];

    switch (preliminarySpec.orient) {
        case "top":
            xy = { x: anchorPos, y: 1 };
            orientConfig = { baseline: "alphabetic", angle: 0 };
            break;
        case "right":
            xy = { x: 1, y: 1 - anchorPos };
            orientConfig = { baseline: "alphabetic", angle: 90 };
            break;
        case "bottom":
            xy = { x: anchorPos, y: 0 };
            orientConfig = { baseline: "top", angle: 0 };
            break;
        case "left":
            xy = { x: 0, y: anchorPos };
            orientConfig = { baseline: "alphabetic", angle: -90 };
            break;
        default:
    }

    /** @type {import("../spec/title.js").Title} */
    const spec = {
        ...BASE_TITLE_STYLE,
        ...orientConfig,
        ...config,
        ...titleSpec,
    };

    const offsets = { xOffset: 0, yOffset: 0 };
    switch (preliminarySpec.orient) {
        case "top":
            offsets.yOffset = -spec.offset;
            break;
        case "right":
            offsets.xOffset = spec.offset;
            break;
        case "bottom":
            offsets.yOffset = spec.offset;
            break;
        case "left":
            offsets.xOffset = -spec.offset;
            break;
        default:
    }

    return {
        configurableVisibility: false,
        data: { values: [{}] },
        mark: {
            type: "text",
            tooltip: null,
            clip: false,

            ...xy,
            ...offsets,

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
