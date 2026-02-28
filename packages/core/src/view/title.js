import { isString } from "vega-util";
import {
    getConfiguredStyleConfig,
    getConfiguredTitleConfig,
} from "../config/titleConfig.js";

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
 * @param {import("../spec/config.js").GenomeSpyConfig[]} [configScopes]
 * @returns {import("../spec/view.js").UnitSpec}
 */
export default function createTitle(title, configScopes = []) {
    if (!title) {
        return;
    }

    /** @type {import("../spec/title.js").Title} */
    const titleSpec = isString(title) ? { text: title } : title;

    if (!titleSpec.text || titleSpec.orient == "none") {
        return;
    }

    const titleConfig = getConfiguredTitleConfig(configScopes);
    const styleConfig = /** @type {import("../spec/config.js").TitleConfig} */ (
        getConfiguredStyleConfig(configScopes, titleSpec.style)
    );

    // TODO: frame prop

    /** @type {import("../spec/title.js").Title} */
    const preliminarySpec = {
        ...titleConfig,
        ...styleConfig,
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
        ...titleConfig,
        ...orientConfig,
        ...styleConfig,
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
