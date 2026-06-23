import ContainerView from "./containerView.js";
import UnitView from "./unitView.js";
import { isString } from "vega-util";
import { isExprRef } from "../paramRuntime/paramUtils.js";
import {
    getProjectedTextExtent,
    measureText,
    requestFont,
} from "../fonts/textMetrics.js";
import Padding from "./layout/padding.js";
import { markViewAsChrome, markViewAsNonAddressable } from "./viewSelectors.js";
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

const DEFAULT_TITLE_STYLE = "group-title";
const DEFAULT_SUBTITLE_STYLE = "group-subtitle";

/**
 * @param {import("../spec/config.js").StyleConfig} styleConfig
 * @returns {Partial<import("../spec/title.js").Title>}
 */
function subtitleStyleToTitleConfig(styleConfig) {
    return pickDefined({
        subtitleColor: styleConfig.color,
        subtitleFont: styleConfig.font,
        subtitleFontSize: styleConfig.fontSize,
        subtitleFontStyle: styleConfig.fontStyle,
        subtitleFontWeight: styleConfig.fontWeight,
    });
}

/**
 * @param {import("../spec/config.js").TitleConfig} titleConfig
 * @returns {Partial<import("../spec/title.js").Title>}
 */
function pickSubtitleTitleConfig(titleConfig) {
    return pickDefined({
        subtitleColor: titleConfig.subtitleColor,
        subtitleFont: titleConfig.subtitleFont,
        subtitleFontSize: titleConfig.subtitleFontSize,
        subtitleFontStyle: titleConfig.subtitleFontStyle,
        subtitleFontWeight: titleConfig.subtitleFontWeight,
        subtitlePadding: titleConfig.subtitlePadding,
    });
}

/**
 * @param {Partial<import("../spec/title.js").Title>} config
 */
function pickDefined(config) {
    return Object.fromEntries(
        Object.entries(config).filter(([, value]) => value !== undefined)
    );
}

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
function resolveTitleSpec(title, configScopes = []) {
    if (!title) {
        return;
    }

    /** @type {import("../spec/title.js").Title} */
    const titleSpec = isString(title) ? { text: title } : title;

    if (!titleSpec.text) {
        return;
    }

    const titleConfig = getConfiguredTitleConfig(configScopes);
    const styleConfig = /** @type {import("../spec/config.js").TitleConfig} */ (
        getConfiguredStyleConfig(
            configScopes,
            titleSpec.style ?? DEFAULT_TITLE_STYLE
        )
    );
    const subtitleStyleConfig = subtitleStyleToTitleConfig(
        getConfiguredStyleConfig(configScopes, DEFAULT_SUBTITLE_STYLE)
    );

    /** @type {import("../spec/title.js").Title} */
    const preliminarySpec = {
        ...titleConfig,
        ...styleConfig,
        ...subtitleStyleConfig,
        ...pickSubtitleTitleConfig(titleConfig),
        ...titleSpec,
    };

    if (preliminarySpec.orient == "none") {
        return;
    }

    const { orientConfig } = getTitleOrientMetadata(preliminarySpec);

    return {
        ...titleConfig,
        ...orientConfig,
        ...styleConfig,
        ...subtitleStyleConfig,
        ...pickSubtitleTitleConfig(titleConfig),
        ...titleSpec,
    };
}

/**
 * @param {import("../spec/title.js").Title} spec
 * @param {{ fontManager: import("../fonts/textMetrics.js").FontManagerLike }} context
 * @returns {{ xOffset: number, yOffset: number }}
 */
function getTitleOffsets(spec, context) {
    const subtitleSpacing = spec.subtitle
        ? getSubtitleTextPerpendicularExtent(spec, context) +
          (spec.subtitlePadding ?? 0)
        : 0;
    const distance =
        spec.offset +
        (isTitleOutsideSubtitle(spec.orient) ? subtitleSpacing : 0);

    return getOrientOffset(spec.orient, distance);
}

/**
 * @param {import("../spec/title.js").Title} spec
 * @param {{ fontManager: import("../fonts/textMetrics.js").FontManagerLike }} context
 * @returns {{ xOffset: number, yOffset: number }}
 */
function getSubtitleOffsets(spec, context) {
    const spacing =
        getTitleTextPerpendicularExtent(spec, context) +
        (spec.subtitlePadding ?? 0);
    const distance =
        spec.offset + (isTitleOutsideSubtitle(spec.orient) ? 0 : spacing);

    return getOrientOffset(spec.orient, distance);
}

/**
 * @param {import("../spec/title.js").TitleOrient} orient
 */
function isTitleOutsideSubtitle(orient) {
    switch (orient) {
        case "top":
        case "left":
            return true;
        case "right":
        case "bottom":
            return false;
        default:
            return false;
    }
}

/**
 * @param {import("../spec/title.js").TitleOrient} orient
 * @param {number} distance
 * @returns {{ xOffset: number, yOffset: number }}
 */
function getOrientOffset(orient, distance) {
    const offsets = { xOffset: 0, yOffset: 0 };
    switch (orient) {
        case "top":
            offsets.yOffset = -distance;
            break;
        case "right":
            offsets.xOffset = distance;
            break;
        case "bottom":
            offsets.yOffset = distance;
            break;
        case "left":
            offsets.xOffset = -distance;
            break;
        default:
    }
    return offsets;
}

/**
 * @param {import("../spec/title.js").Title | undefined} spec
 * @param {{ fontManager: import("../fonts/textMetrics.js").FontManagerLike }} context
 */
function requestTitleFont(spec, context) {
    return requestFont(context.fontManager, spec ?? {});
}

/**
 * @param {import("../spec/title.js").Title} spec
 * @param {{ fontManager: import("../fonts/textMetrics.js").FontManagerLike }} context
 */
function requestSubtitleFont(spec, context) {
    return requestFont(context.fontManager, getSubtitleFontConfig(spec));
}

/**
 * Requests title fonts so asynchronous font loading is registered before
 * layout uses title metrics.
 *
 * @param {import("../spec/title.js").Title} spec
 * @param {{ fontManager: import("../fonts/textMetrics.js").FontManagerLike }} context
 */
function requestTitleFonts(spec, context) {
    requestTitleFont(spec, context);
    if (spec.subtitle) {
        requestSubtitleFont(spec, context);
    }
}

/**
 * @param {import("../spec/title.js").Title} spec
 * @param {{ fontManager: import("../fonts/textMetrics.js").FontManagerLike }} context
 * @returns {Padding}
 */
function getTitleOverhang(spec, context) {
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
    const titleExtent = getTitleTextPerpendicularExtent(spec, context);
    if (!spec.subtitle) {
        return titleExtent;
    }

    const subtitleExtent = getSubtitleTextPerpendicularExtent(spec, context);

    return titleExtent + (spec.subtitlePadding ?? 0) + subtitleExtent;
}

/**
 * @param {import("../spec/title.js").Title} spec
 * @param {{ fontManager: import("../fonts/textMetrics.js").FontManagerLike }} context
 */
function getTitleTextPerpendicularExtent(spec, context) {
    const font = requestTitleFont(spec, context);
    const fontSize = getFontSize(spec.fontSize, 12);

    return getTextPerpendicularExtent(
        spec,
        context,
        spec.text,
        font.metrics,
        fontSize
    );
}

/**
 * @param {import("../spec/title.js").Title} spec
 * @param {{ fontManager: import("../fonts/textMetrics.js").FontManagerLike }} context
 */
function getSubtitleTextPerpendicularExtent(spec, context) {
    const font = requestSubtitleFont(spec, context);
    const fontSize = getFontSize(spec.subtitleFontSize, 11);

    return getTextPerpendicularExtent(
        spec,
        context,
        spec.subtitle,
        font.metrics,
        fontSize
    );
}

/**
 * @param {number | import("../spec/parameter.js").ExprRef | undefined} fontSize
 * @param {number} fallback
 */
function getFontSize(fontSize, fallback) {
    return isExprRef(fontSize) ? fallback : (fontSize ?? fallback);
}

/**
 * @param {import("../spec/title.js").Title} spec
 * @param {{ fontManager: import("../fonts/textMetrics.js").FontManagerLike }} context
 * @param {string | import("../spec/parameter.js").ExprRef} text
 * @param {import("../fonts/textMetrics.js").FontEntryLike["metrics"]} metrics
 * @param {number} fontSize
 */
function getTextPerpendicularExtent(spec, context, text, metrics, fontSize) {
    const angle = isExprRef(spec.angle) ? 0 : (spec.angle ?? 0);
    const direction =
        spec.orient == "top" || spec.orient == "bottom"
            ? "vertical"
            : "horizontal";

    return getProjectedTextExtent(
        measureTextWithFallback(text, context, metrics, fontSize),
        angle,
        direction
    );
}

/**
 * @param {import("../spec/title.js").Title} spec
 * @returns {import("../fonts/textMetrics.js").FontConfig}
 */
function getSubtitleFontConfig(spec) {
    return {
        font: spec.subtitleFont,
        fontStyle: spec.subtitleFontStyle,
        fontWeight: spec.subtitleFontWeight,
    };
}

/**
 * @param {{ fontManager: import("../fonts/textMetrics.js").FontManagerLike }} context
 * @param {string | import("../spec/parameter.js").ExprRef} text
 * @param {import("../fonts/textMetrics.js").FontEntryLike["metrics"]} metrics
 * @param {number} fontSize
 */
function measureTextWithFallback(text, context, metrics, fontSize) {
    if (metrics) {
        return measureTextValue(text, metrics, fontSize);
    }

    const fallbackMetrics = context.fontManager.getDefaultFont().metrics;
    if (fallbackMetrics) {
        return measureTextValue(text, fallbackMetrics, fontSize);
    }

    return { width: 0, height: fontSize };
}

/**
 * @param {string | import("../spec/parameter.js").ExprRef} text
 * @param {import("../fonts/bmFontManager.js").BMFontMetrics} metrics
 * @param {number} fontSize
 */
function measureTextValue(text, metrics, fontSize) {
    const value = typeof text == "string" ? text : String(text.expr);
    return measureText(metrics, value, fontSize);
}

/**
 * @param {import("../spec/title.js").Title} spec
 * @param {{ x: number, y: number }} xy
 * @param {{ xOffset: number, yOffset: number }} offsets
 * @param {boolean} subtitle
 * @returns {import("../spec/mark.js").TextProps}
 */
function createTitleTextMark(spec, xy, offsets, subtitle) {
    return {
        type: "text",
        tooltip: null,
        clip: false,

        ...xy,
        ...offsets,

        text: subtitle ? spec.subtitle : spec.text,

        align: spec.align ?? ANCHOR_TO_ALIGN[spec.anchor ?? "middle"],
        angle: spec.angle,
        baseline: spec.baseline,
        dx: spec.dx,
        dy: spec.dy,
        color: subtitle ? spec.subtitleColor : spec.color,
        font: subtitle ? spec.subtitleFont : spec.font,
        size: subtitle ? spec.subtitleFontSize : spec.fontSize,
        fontStyle: subtitle ? spec.subtitleFontStyle : spec.fontStyle,
        fontWeight: subtitle ? spec.subtitleFontWeight : spec.fontWeight,
    };
}

/**
 * @param {import("../spec/title.js").Title} titleSpec
 * @param {{ fontManager: import("../fonts/textMetrics.js").FontManagerLike }} context
 * @returns {import("../spec/view.js").UnitSpec[]}
 */
function createTitleUnitSpecs(titleSpec, context) {
    const { xy } = getTitleOrientMetadata(titleSpec);
    const specs = [
        {
            name: "title",
            data: { values: [{}] },
            mark: createTitleTextMark(
                titleSpec,
                xy,
                getTitleOffsets(titleSpec, context),
                false
            ),
        },
    ];

    if (titleSpec.subtitle) {
        specs.push({
            name: "subtitle",
            data: { values: [{}] },
            mark: createTitleTextMark(
                titleSpec,
                xy,
                getSubtitleOffsets(titleSpec, context),
                true
            ),
        });
    }

    return specs;
}

/**
 * Generated chrome view for view titles.
 *
 * @extends {ContainerView<import("../spec/view.js").LayerSpec>}
 */
export default class TitleView extends ContainerView {
    /** @type {UnitView[]} */
    #children;

    /** @type {import("../spec/title.js").Title} */
    titleSpec;

    /**
     * @param {string | import("../spec/title.js").Title} title
     * @param {import("../spec/config.js").GenomeSpyConfig[]} configScopes
     * @param {import("../types/viewContext.js").default} context
     * @param {ContainerView} layoutParent
     * @param {import("./view.js").default} dataParent
     * @param {string} name
     * @param {import("./view.js").ViewOptions} [options]
     * @returns {TitleView | undefined}
     */
    static create(
        title,
        configScopes,
        context,
        layoutParent,
        dataParent,
        name,
        options
    ) {
        const titleSpec = resolveTitleSpec(title, configScopes);
        return titleSpec
            ? new TitleView(
                  titleSpec,
                  context,
                  layoutParent,
                  dataParent,
                  name,
                  options
              )
            : undefined;
    }

    /**
     * @param {import("../spec/title.js").Title} titleSpec
     * @param {import("../types/viewContext.js").default} context
     * @param {ContainerView} layoutParent
     * @param {import("./view.js").default} dataParent
     * @param {string} name
     * @param {import("./view.js").ViewOptions} [options]
     */
    constructor(titleSpec, context, layoutParent, dataParent, name, options) {
        requestTitleFonts(titleSpec, context);

        const childSpecs = createTitleUnitSpecs(titleSpec, context);
        const spec = /** @type {import("../spec/view.js").LayerSpec} */ ({
            layer: [],
        });
        super(spec, context, layoutParent, dataParent, name, options);
        this.titleSpec = titleSpec;
        markViewAsNonAddressable(this, { skipSubtree: true });
        markViewAsChrome(this, { skipSubtree: true });

        this.#children = childSpecs.map(
            (unitSpec, index) =>
                new UnitView(
                    unitSpec,
                    context,
                    this,
                    dataParent,
                    name + "-" + (unitSpec.name ?? index),
                    {
                        blockEncodingInheritance: true,
                    }
                )
        );
    }

    /**
     * @returns {IterableIterator<UnitView>}
     */
    *[Symbol.iterator]() {
        yield* this.#children;
    }

    getOverhang() {
        return getTitleOverhang(this.titleSpec, this.context);
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext.js").default} context
     * @param {import("./layout/rectangle.js").default} coords
     * @param {import("../types/rendering.js").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        super.render(context, coords, options);

        if (!this.isConfiguredVisible()) {
            return;
        }

        context.pushView(this, coords);
        for (const child of this.#children) {
            child.render(context, coords, options);
        }
        context.popView(this);
    }
}
