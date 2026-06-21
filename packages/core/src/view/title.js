import { isString } from "vega-util";
import {
    getConfiguredStyleConfig,
    getConfiguredTitleConfig,
} from "../config/titleConfig.js";
import {
    getProjectedTextExtent,
    measureText,
    requestFont,
} from "../fonts/textMetrics.js";
import Padding from "./layout/padding.js";
import { isExprRef } from "../paramRuntime/paramUtils.js";

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

const DEFAULT_TITLE_STYLE = "group-title";

/**
 * @param {import("../spec/title.js").Title} spec
 */
function getTitleOrientMetadata(spec) {
    /** @type {Partial<import("../spec/title.js").Title>} */
    let orientConfig = {};
    let xy = { x: 0, y: 0 };

    const anchorPos = ANCHORS[spec.anchor ?? "middle"];

    switch (spec.orient) {
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

    return { orientConfig, xy };
}

/**
 * @param {string | import("../spec/title.js").Title} title
 * @param {import("../spec/config.js").GenomeSpyConfig[]} [configScopes]
 * @returns {import("../spec/title.js").Title}
 */
export function resolveTitleSpec(title, configScopes = []) {
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
        getConfiguredStyleConfig(
            configScopes,
            titleSpec.style ?? DEFAULT_TITLE_STYLE
        )
    );

    // TODO: frame prop

    /** @type {import("../spec/title.js").Title} */
    const preliminarySpec = {
        ...titleConfig,
        ...styleConfig,
        ...titleSpec,
    };

    const { orientConfig } = getTitleOrientMetadata(preliminarySpec);

    return {
        ...titleConfig,
        ...orientConfig,
        ...styleConfig,
        ...titleSpec,
    };
}

/**
 * Requests the title font so asynchronous font loading is registered before
 * layout uses title metrics.
 *
 * @param {import("../spec/title.js").Title | undefined} spec
 * @param {{ fontManager: import("../fonts/textMetrics.js").FontManagerLike }} context
 */
export function requestTitleFont(spec, context) {
    return requestFont(context.fontManager, spec ?? {});
}

/**
 * @param {import("../spec/title.js").Title} spec
 * @param {{ fontManager: import("../fonts/textMetrics.js").FontManagerLike }} context
 * @returns {Padding}
 */
export function getTitleOverhang(spec, context) {
    if (
        !spec ||
        spec.reserve === false ||
        spec.orient == "none" ||
        spec.offset < 0
    ) {
        return Padding.zero();
    }

    const extent = getTitlePerpendicularExtent(spec, context);
    const reserved = Math.ceil(extent + Math.max(spec.offset ?? 0, 0));

    switch (spec.orient) {
        case "top":
            return new Padding(reserved, 0, 0, 0);
        case "right":
            return new Padding(0, reserved, 0, 0);
        case "bottom":
            return new Padding(0, 0, reserved, 0);
        case "left":
            return new Padding(0, 0, 0, reserved);
        default:
            return Padding.zero();
    }
}

/**
 * @param {import("../spec/title.js").Title} spec
 * @param {{ fontManager: import("../fonts/textMetrics.js").FontManagerLike }} context
 */
function getTitlePerpendicularExtent(spec, context) {
    const fontSize = isExprRef(spec.fontSize) ? 12 : (spec.fontSize ?? 12);
    const angle = isExprRef(spec.angle) ? 0 : (spec.angle ?? 0);
    const font = requestTitleFont(spec, context);
    const metrics = font.metrics;
    const direction =
        spec.orient == "top" || spec.orient == "bottom"
            ? "vertical"
            : "horizontal";

    if (!metrics) {
        const fallbackMetrics = context.fontManager.getDefaultFont().metrics;
        if (!fallbackMetrics) {
            return fontSize;
        }

        return getProjectedTextExtent(
            measureTitleText(spec, fallbackMetrics, fontSize),
            angle,
            direction
        );
    }

    return getProjectedTextExtent(
        measureTitleText(spec, metrics, fontSize),
        angle,
        direction
    );
}

/**
 * @param {import("../spec/title.js").Title} spec
 * @param {import("../fonts/bmFontManager.js").BMFontMetrics} metrics
 * @param {number} fontSize
 */
function measureTitleText(spec, metrics, fontSize) {
    const text =
        typeof spec.text == "string" ? spec.text : String(spec.text.expr);

    return measureText(metrics, text, fontSize);
}

/**
 * @param {import("../spec/title.js").Title | undefined} spec
 * @returns {import("../spec/view.js").UnitSpec}
 */
export function createTitleFromResolvedSpec(spec) {
    if (!spec) {
        return;
    }

    const { xy } = getTitleOrientMetadata(spec);

    const offsets = { xOffset: 0, yOffset: 0 };
    switch (spec.orient) {
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

/**
 * @param {string | import("../spec/title.js").Title} title
 * @param {import("../spec/config.js").GenomeSpyConfig[]} [configScopes]
 * @returns {import("../spec/view.js").UnitSpec}
 */
export default function createTitle(title, configScopes = []) {
    return createTitleFromResolvedSpec(resolveTitleSpec(title, configScopes));
}
