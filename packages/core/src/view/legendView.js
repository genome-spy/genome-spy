/**
 * Legend generation is largely modeled after Vega and Vega-Lite legends,
 * including the public properties, default values, and legend-type/entry
 * logic. The most relevant references are:
 *
 * - vega-lite/src/legend.ts
 * - vega-lite/src/compile/legend/*
 * - vega/packages/vega-parser/src/parsers/legend.js
 * - vega/packages/vega-parser/src/parsers/guides/legend-*.js
 * - vega/packages/vega-view-transforms/src/layout/legend.js
 *
 * GenomeSpy's implementation is intentionally different. Vega emits a Vega
 * legend definition and relies on the scenegraph plus legend layout transform
 * for final mark bounds and placement. GenomeSpy instead builds legends from
 * ordinary internal views and marks, uses `measureText`/`packLegendLabels` for
 * symbol entry layout, and lets `GridChild` own local side/corner placement and
 * stacked legend regions.
 */

import ContainerView from "./containerView.js";
import { FlexDimensions } from "./layout/flexLayout.js";
import UnitView from "./unitView.js";
import { markViewAsChrome, markViewAsNonAddressable } from "./viewSelectors.js";
import { truncateText } from "../data/transforms/truncateText.js";

const LABEL_WIDTH_FIELD = "_legendLabelWidth";
const SYMBOL_SIZE_FIELD = "_legendSymbolSize";
const SYMBOL_STROKE_WIDTH_FIELD = "_legendStrokeWidth";
const DEFAULT_GRADIENT_LEGEND_LENGTH = 200;
const DEFAULT_GRADIENT_SAMPLE_COUNT = 64;
const DEFAULT_GRADIENT_TICK_COUNT = 5;
const DEFAULT_GRADIENT_THICKNESS = 12;
const DEFAULT_GRADIENT_TICK_SIZE = 4;
const MIN_GRADIENT_LEGEND_LENGTH = 40;
const AUTO_EXTENT_GROW_THRESHOLD_PX = 2;
/** @type {import("../spec/view.js").ViewBackground} */
const LEGEND_VIEW_BACKGROUND = {
    fillOpacity: 0,
    shadowOpacity: 0,
    strokeOpacity: 0,
};

/**
 * Legend internals use scale-backed helper marks but must not create their own
 * axes or legends from inherited configuration.
 *
 * This must be applied to every generated child spec, not just the LegendView
 * root. The generated subtree contains ordinary unit views, including text
 * views and helper marks with internal x/y placement channels. Those channels
 * are implementation details of the legend, even when they are value-backed and
 * not semantically scale-backed data encodings.
 *
 * Without this exclusion, a generated child can still end up with an axis
 * resolution and inherit axis defaults such as `grid: true`, creating an
 * AxisGridView inside the legend. This has been observed with the title view:
 * the authored title encoding only had `text`, but the unexcluded generated
 * title still received an x-axis resolution through the normal guide machinery.
 *
 * The legend may still force the represented source scale, e.g. color/size, but
 * generated helper x/y channels and nested legend channels must stay out of the
 * normal guide resolution machinery.
 *
 * See:
 * - https://github.com/genome-spy/genome-spy/issues/412
 * - https://github.com/genome-spy/genome-spy/issues/413
 *
 * @template {import("../spec/view.js").ViewSpec & {
 *     resolve?: any,
 *     layer?: any[],
 *     vconcat?: any[],
 *     hconcat?: any[]
 * }} T
 * @param {T} spec
 * @returns {T}
 */
function excludeLegendGuideResolutions(spec) {
    spec.resolve = {
        ...spec.resolve,
        axis: { default: "excluded", ...spec.resolve?.axis },
        legend: { default: "excluded", ...spec.resolve?.legend },
    };

    for (const children of [spec.layer, spec.vconcat, spec.hconcat]) {
        children?.forEach(excludeLegendGuideResolutions);
    }

    return spec;
}

/**
 * @typedef {import("../spec/legend.js").LegendConfig} LegendConfig
 * @typedef {import("./legend/legendEntries.js").LegendEntry} LegendEntry
 * @typedef {(import("../spec/view.js").VConcatSpec | import("../spec/view.js").HConcatSpec) & {
 *     view: import("../spec/view.js").ViewBackground
 * }} LegendRootSpec
 * @typedef {{
 *     mark?: Partial<import("../spec/mark.js").PointProps>,
 *     encoding?: Partial<import("../spec/channel.js").Encoding>
 * }} SymbolLegendStyle
 */

/**
 * @param {LegendConfig} legend
 * @returns {import("../spec/view.js").ViewBackground}
 */
function createLegendViewBackground(legend) {
    return {
        fill: legend.backgroundFill,
        fillOpacity: legend.backgroundFill
            ? (legend.backgroundFillOpacity ?? 1)
            : 0,
        stroke: legend.backgroundStroke,
        strokeWidth: legend.backgroundStrokeWidth,
        strokeOpacity: legend.backgroundStroke
            ? (legend.backgroundStrokeOpacity ?? 1)
            : 0,
        shadowOpacity: 0,
    };
}

/**
 * @param {LegendConfig} legend
 * @param {import("../types/viewContext.js").default} context
 * @returns {import("../spec/view.js").UnitSpec | undefined}
 */
function createLegendTitleSpec(legend, context) {
    const title = legend.title;

    if (!title) {
        return undefined;
    }

    const titleFontSize = legend.titleFontSize ?? 11;
    const titlePadding = legend.titlePadding ?? 5;
    const sideTitle = isSideTitle(legend);
    const titleWidth = Math.ceil(getTitleWidth(legend, context));
    const sideTitleWidth = titleWidth + titlePadding;

    return {
        name: "title",
        width: sideTitle ? sideTitleWidth : undefined,
        height: sideTitle ? { grow: 1 } : titleFontSize + titlePadding,
        view: LEGEND_VIEW_BACKGROUND,
        data: {
            values: [{ label: title }],
        },
        transform: [
            {
                type: "truncateText",
                field: "label",
                limit: legend.titleLimit,
                fontSize: titleFontSize,
                font: legend.titleFont,
                fontStyle: legend.titleFontStyle,
                fontWeight: legend.titleFontWeight,
            },
        ],
        mark: {
            type: "text",
            clip: false,
            x:
                getTitleOrient(legend) == "right" && sideTitleWidth > 0
                    ? titlePadding / sideTitleWidth
                    : 0,
            y: 0.5,
            align: "left",
            baseline: "middle",
            color: legend.titleColor,
            font: legend.titleFont,
            fontStyle: legend.titleFontStyle,
            fontWeight: legend.titleFontWeight,
            size: titleFontSize,
        },
        encoding: {
            text: { field: "label" },
        },
    };
}

/**
 * @param {LegendConfig} legend
 * @param {import("../spec/view.js").ViewSpec} body
 * @param {import("../types/viewContext.js").default} context
 * @param {import("../spec/channel.js").ChannelWithScale[]} [forcedScaleChannels]
 * @returns {LegendRootSpec}
 */
function createLegendRootSpec(legend, body, context, forcedScaleChannels = []) {
    const title = createLegendTitleSpec(legend, context);
    /** @type {{ vconcat: import("../spec/view.js").ViewSpec[] } | { hconcat: import("../spec/view.js").ViewSpec[] }} */
    let children;

    if (!title) {
        children = { vconcat: [body] };
    } else if (getTitleOrient(legend) == "bottom") {
        children = { vconcat: [body, title] };
    } else if (getTitleOrient(legend) == "left") {
        children = { hconcat: [title, body] };
    } else if (getTitleOrient(legend) == "right") {
        children = { hconcat: [body, title] };
    } else {
        children = { vconcat: [title, body] };
    }

    return excludeLegendGuideResolutions({
        name: "legend_" + (legend.orient ?? "right"),
        padding: legend.padding,
        view: createLegendViewBackground(legend),
        resolve: {
            scale: Object.fromEntries(
                forcedScaleChannels.map((channel) => [channel, "forced"])
            ),
        },
        spacing: 0,
        ...children,
    });
}

/**
 * @param {LegendConfig} legend
 */
function isHorizontalLegend(legend) {
    return legend.orient == "top" || legend.orient == "bottom";
}

/**
 * @param {LegendConfig} legend
 * @returns {import("../spec/legend.js").LegendTitleOrient}
 */
function getTitleOrient(legend) {
    return legend.titleOrient ?? "top";
}

/**
 * @param {LegendConfig} legend
 */
function isSideTitle(legend) {
    const titleOrient = getTitleOrient(legend);

    return titleOrient == "left" || titleOrient == "right";
}

/**
 * @param {string | undefined} value
 * @returns {import("../spec/channel.js").ValueDef | undefined}
 */
function createBaseColorEncoding(value) {
    if (value === undefined) {
        return undefined;
    } else if (value == "transparent") {
        return { value: null };
    } else {
        return { value };
    }
}

/**
 * Rule and link marks use the `size` channel as stroke width. Vega/Vega-Lite
 * still represent comparable guides as symbol legends; GenomeSpy renders this
 * variant as a short rule so the legend explains stroke width directly.
 *
 * @param {object} options
 * @param {import("../spec/channel.js").ChannelWithScale} options.channel
 * @param {import("../spec/channel.js").Type} options.dataType
 * @param {import("../spec/scale.js").Scale} options.horizontalPixelScale
 * @param {import("../spec/scale.js").Scale} options.verticalPixelScale
 * @param {LegendConfig} options.legend
 * @param {SymbolLegendStyle} options.symbolStyle
 * @returns {import("../spec/view.js").UnitSpec}
 */
function createStrokeSymbolLayer({
    channel,
    dataType,
    horizontalPixelScale,
    verticalPixelScale,
    legend,
    symbolStyle,
}) {
    const styleEncoding =
        /** @type {Partial<import("../spec/channel.js").Encoding>} */ (
            symbolStyle.encoding ?? {}
        );
    const color =
        styleEncoding.color ??
        styleEncoding.stroke ??
        styleEncoding.fill ??
        createBaseColorEncoding(legend.symbolBaseStrokeColor);

    return {
        name: "symbols",
        mark: {
            type: "rule",
            clip: false,
            cullByVisibleRange: false,
            opacity: symbolStyle.mark?.opacity,
        },
        encoding: {
            x: {
                field: "symbolX",
                type: "quantitative",
                scale: horizontalPixelScale,
                axis: null,
                buildIndex: false,
            },
            x2: {
                field: "symbolX2",
                type: "quantitative",
                scale: horizontalPixelScale,
                axis: null,
            },
            y: {
                field: "labelY2",
                type: "quantitative",
                scale: verticalPixelScale,
                axis: null,
            },
            y2: {
                field: "labelY2",
                type: "quantitative",
                scale: verticalPixelScale,
                axis: null,
            },
            [channel]: {
                field: "value",
                type: dataType,
                domainInert: true,
            },
            ...(color ? { color } : {}),
            ...(styleEncoding.opacity
                ? { opacity: styleEncoding.opacity }
                : {}),
        },
    };
}

/**
 * @param {object} options
 * @param {LegendEntry[]} [options.entries]
 * @param {import("../spec/channel.js").ChannelWithScale} options.channel
 * @param {Partial<Record<import("../spec/channel.js").ChannelWithScale, string>>} [options.symbolChannels]
 * @param {SymbolLegendStyle} [options.symbolStyle]
 * @param {"point" | "stroke"} [options.symbolGeometry]
 * @param {LegendConfig} options.legend
 * @param {string} [options.format]
 * @param {import("../spec/channel.js").Type} options.dataType
 * @param {import("../types/viewContext.js").default} options.context
 * @returns {LegendRootSpec}
 */
export function createSymbolLegendSpec({
    entries,
    channel,
    symbolChannels = {},
    symbolStyle = {},
    symbolGeometry = "point",
    legend,
    format,
    dataType,
    context,
}) {
    const strokeSymbol = symbolGeometry == "stroke";
    const horizontalLegend = isHorizontalLegend(legend);
    const labelAlign = legend.labelAlign ?? "left";
    const labelBaseline = legend.labelBaseline ?? "middle";
    const labelFontSize = legend.labelFontSize ?? 10;
    const scaledSymbolChannels = new Set([
        channel,
        ...Object.keys(symbolChannels),
    ]);
    const isBaseColorChannelScaled = (
        /** @type {import("../spec/channel.js").ChannelWithScale} */ channel
    ) => scaledSymbolChannels.has(channel) || scaledSymbolChannels.has("color");
    const baseSymbolEncoding = Object.fromEntries(
        /** @type {const} */ ([
            ["fill", createBaseColorEncoding(legend.symbolBaseFillColor)],
            ["stroke", createBaseColorEncoding(legend.symbolBaseStrokeColor)],
        ])
            .filter(
                ([channel, encoding]) =>
                    !isBaseColorChannelScaled(channel) && encoding !== undefined
            )
            .map(([channel, encoding]) => [channel, encoding])
    );
    const horizontalPixelScale = {
        domain: [0, { expr: "width" }],
        zero: false,
        nice: false,
    };
    const verticalPixelScale = {
        domain: [0, { expr: "height" }],
        zero: false,
        nice: false,
    };

    /** @type {import("../spec/view.js").UnitSpec[]} */
    const layer = [
        strokeSymbol
            ? createStrokeSymbolLayer({
                  channel,
                  dataType,
                  horizontalPixelScale,
                  verticalPixelScale,
                  legend,
                  symbolStyle,
              })
            : {
                  name: "symbols",
                  mark: {
                      type: "point",
                      clip: false,
                      cullByVisibleRange: false,
                      filled: channel == "fill",
                      shape: legend.symbolType,
                      size: legend.symbolSize,
                      strokeWidth: legend.symbolStrokeWidth,
                      ...symbolStyle.mark,
                  },
                  encoding: {
                      x: {
                          field: "entryX",
                          type: "quantitative",
                          scale: horizontalPixelScale,
                          axis: null,
                          buildIndex: false,
                      },
                      y: {
                          field: "labelY2",
                          type: "quantitative",
                          scale: verticalPixelScale,
                          axis: null,
                      },
                      [channel]: {
                          field: "value",
                          type: dataType,
                          domainInert: true,
                      },
                      ...baseSymbolEncoding,
                      ...symbolStyle.encoding,
                      ...Object.fromEntries(
                          Object.entries(symbolChannels).map(([channel]) => [
                              channel,
                              {
                                  field: "value",
                                  type: dataType,
                                  domainInert: true,
                              },
                          ])
                      ),
                  },
              },
    ];

    layer.push({
        name: "labels",
        mark: {
            type: "text",
            clip: false,
            cullByVisibleRange: false,
            align: labelAlign,
            baseline: labelBaseline,
            color: legend.labelColor,
            font: legend.labelFont,
            fontStyle: legend.labelFontStyle,
            fontWeight: legend.labelFontWeight,
            size: labelFontSize,
        },
        encoding: {
            x: {
                field: "labelX",
                type: "quantitative",
                scale: horizontalPixelScale,
                axis: null,
                buildIndex: false,
            },
            y: {
                field: "labelY2",
                type: "quantitative",
                scale: verticalPixelScale,
                axis: null,
            },
            text: { field: "label" },
        },
    });

    return createLegendRootSpec(
        legend,
        {
            name: "legendBody",
            height: { grow: 1 },
            view: LEGEND_VIEW_BACKGROUND,
            resolve: {
                scale: { x: "excluded", y: "excluded" },
                axis: { x: "excluded", y: "excluded" },
            },
            data: entries
                ? { values: entries }
                : {
                      lazy: {
                          type: "legendEntries",
                          channel,
                          dataType,
                          format,
                          values: legend.values,
                          sizeMode: strokeSymbol ? "strokeWidth" : "area",
                      },
                  },
            transform: [
                {
                    type: "truncateText",
                    field: "label",
                    limit: legend.labelLimit,
                    fontSize: labelFontSize,
                    font: legend.labelFont,
                    fontStyle: legend.labelFontStyle,
                    fontWeight: legend.labelFontWeight,
                },
                {
                    type: "measureText",
                    field: "label",
                    as: LABEL_WIDTH_FIELD,
                    fontSize: labelFontSize,
                    font: legend.labelFont,
                    fontStyle: legend.labelFontStyle,
                    fontWeight: legend.labelFontWeight,
                },
                {
                    type: "packLegendLabels",
                    labelWidth: LABEL_WIDTH_FIELD,
                    columns: legend.columns,
                    symbolSize: strokeSymbol
                        ? legend.symbolSize
                        : channel == "size"
                          ? SYMBOL_SIZE_FIELD
                          : legend.symbolSize,
                    symbolStrokeWidth: strokeSymbol
                        ? SYMBOL_STROKE_WIDTH_FIELD
                        : legend.symbolStrokeWidth,
                    labelOffset: legend.labelOffset,
                    fontSize: labelFontSize,
                    rowPadding: legend.rowPadding,
                    columnPadding: legend.columnPadding,
                    yOffset: 0,
                    yExtent: { expr: "height" },
                    direction: horizontalLegend
                        ? "horizontal"
                        : (legend.direction ?? "vertical"),
                },
            ],
            layer,
        },
        context,
        [channel, ...Object.keys(symbolChannels)]
    );
}

/**
 * @param {object} options
 * @param {import("../spec/channel.js").ChannelWithScale} options.channel
 * @param {LegendConfig} options.legend
 * @param {string} [options.format]
 * @param {import("../types/viewContext.js").default} options.context
 * @returns {LegendRootSpec}
 */
export function createGradientLegendSpec({ channel, legend, format, context }) {
    const h = isHorizontalLegend(legend);
    const labelAlign = h ? "center" : (legend.labelAlign ?? "left");
    const labelBaseline = h ? "top" : (legend.labelBaseline ?? "middle");
    const labelFontSize = legend.labelFontSize ?? 10;
    const labelOffset = legend.labelOffset ?? 4;
    const xs = {
        domain: [0, { expr: "width" }],
        zero: false,
        nice: false,
    };
    const ys = {
        domain: [0, { expr: "height" }],
        zero: false,
        nice: false,
    };
    const ps = {
        domain: [0, 1],
        domainTransition: false,
        zero: false,
        nice: false,
    };
    const labelY = labelFontSize;
    const tickY = labelY + labelOffset;
    const tickY2 = tickY + DEFAULT_GRADIENT_TICK_SIZE;
    const gradientY = tickY2;
    const gradientY2 = gradientY + DEFAULT_GRADIENT_THICKNESS;
    const tickX = DEFAULT_GRADIENT_THICKNESS;
    const tickX2 = DEFAULT_GRADIENT_THICKNESS + DEFAULT_GRADIENT_TICK_SIZE;
    const labelX = tickX2 + labelOffset;
    // p is the gradient axis; q is the cross axis.
    const p = h ? "x" : "y";
    const p2 = /** @type {"x2" | "y2"} */ (p + "2");
    const q = h ? "y" : "x";
    const q2 = /** @type {"x2" | "y2"} */ (q + "2");
    const qs = h ? ys : xs;
    const band0 = "_legendGradientBandStart";
    const band1 = "_legendGradientBandStop";
    const tick0 = "_legendGradientTickStart";
    const tick1 = "_legendGradientTickStop";
    const label = "_legendGradientLabelPosition";
    /**
     * @param {string} field
     * @param {import("../spec/scale.js").Scale} scale
     * @param {boolean} indexed
     * @returns {import("../spec/channel.js").PositionFieldDef}
     */
    const enc = (field, scale, indexed) =>
        /** @type {import("../spec/channel.js").PositionFieldDef} */ ({
            field,
            type: "quantitative",
            scale,
            axis: null,
            ...(indexed ? { buildIndex: false } : {}),
        });
    /** @type {import("../spec/data.js").Data} */
    const tickData = {
        lazy: {
            type: "legendGradientTicks",
            channel,
            count: DEFAULT_GRADIENT_TICK_COUNT,
            format,
            values: legend.values,
        },
    };
    /** @type {import("../spec/transform.js").FormulaParams[]} */
    const tickTransform = [
        {
            type: "formula",
            expr: "" + (h ? tickY : tickX),
            as: tick0,
        },
        {
            type: "formula",
            expr: "" + (h ? tickY2 : tickX2),
            as: tick1,
        },
        {
            type: "formula",
            expr: "" + (h ? labelY : labelX),
            as: label,
        },
    ];
    /** @type {import("../spec/transform.js").FormulaParams[]} */
    const bandTransform = [
        {
            type: "formula",
            expr: "" + (h ? gradientY : 0),
            as: band0,
        },
        {
            type: "formula",
            expr: "" + (h ? gradientY2 : DEFAULT_GRADIENT_THICKNESS),
            as: band1,
        },
    ];

    /** @type {import("../spec/view.js").UnitSpec[]} */
    const bodyLayer = [
        {
            name: "gradientRamp",
            transform: bandTransform,
            mark: {
                type: "rect",
                clip: false,
            },
            encoding: {
                [p]: enc(h ? "position0" : "position1", ps, p == "x"),
                [p2]: {
                    field: h ? "position1" : "position0",
                    type: "quantitative",
                    scale: ps,
                },
                [q]: enc(band0, qs, q == "x"),
                [q2]: {
                    field: band1,
                    type: "quantitative",
                    scale: qs,
                },
                [channel]: {
                    field: "value",
                    type: "quantitative",
                    domainInert: true,
                },
            },
        },
        {
            name: "gradientTicks",
            data: tickData,
            transform: tickTransform,
            mark: {
                type: "rule",
                clip: false,
            },
            encoding: {
                [p]: enc("position", ps, p == "x"),
                [p2]: {
                    field: "position",
                    type: "quantitative",
                    scale: ps,
                },
                [q]: enc(tick0, qs, q == "x"),
                [q2]: {
                    field: tick1,
                    type: "quantitative",
                    scale: qs,
                },
            },
        },
        {
            name: "gradientLabels",
            data: tickData,
            transform: [
                ...tickTransform,
                {
                    type: "truncateText",
                    field: "label",
                    limit: legend.labelLimit,
                    fontSize: labelFontSize,
                    font: legend.labelFont,
                    fontStyle: legend.labelFontStyle,
                    fontWeight: legend.labelFontWeight,
                },
                {
                    type: "measureText",
                    field: "label",
                    as: LABEL_WIDTH_FIELD,
                    fontSize: labelFontSize,
                    font: legend.labelFont,
                    fontStyle: legend.labelFontStyle,
                    fontWeight: legend.labelFontWeight,
                },
            ],
            mark: {
                type: "text",
                clip: false,
                align: labelAlign,
                baseline: labelBaseline,
                color: legend.labelColor,
                font: legend.labelFont,
                fontStyle: legend.labelFontStyle,
                fontWeight: legend.labelFontWeight,
                size: labelFontSize,
            },
            encoding: {
                [p]: enc("position", ps, p == "x"),
                [q]: enc(label, qs, q == "x"),
                text: { field: "label" },
            },
        },
    ];

    return createLegendRootSpec(
        legend,
        {
            name: "gradientBody",
            width: h
                ? { grow: 1, minPx: MIN_GRADIENT_LEGEND_LENGTH }
                : undefined,
            height: h
                ? { grow: 1 }
                : { grow: 1, minPx: MIN_GRADIENT_LEGEND_LENGTH },
            view: LEGEND_VIEW_BACKGROUND,
            resolve: {
                scale: { x: "excluded", y: "excluded" },
                axis: { x: "excluded", y: "excluded" },
            },
            data: {
                lazy: {
                    type: "legendGradient",
                    channel,
                    count: DEFAULT_GRADIENT_SAMPLE_COUNT,
                },
            },
            layer: bodyLayer,
        },
        context,
        [channel]
    );
}

/**
 * @param {{
 *     getPerpendicularSize: () => number,
 *     getOffset: () => number
 * } | undefined} legendView
 * @returns {number}
 */
export function getExternalLegendOverhang(legendView) {
    return legendView
        ? legendView.getPerpendicularSize() + legendView.getOffset()
        : 0;
}

export class LegendRegionView extends ContainerView {
    /** @type {import("./view.js").default | undefined} */
    #child;

    /** @type {LegendView[]} */
    #legendViews = [];

    #stackSpacing;

    /**
     * @param {import("../spec/legend.js").LegendOrient} orient
     * @param {number} stackSpacing
     * @param {import("../types/viewContext.js").default} context
     * @param {import("./containerView.js").default} layoutParent
     * @param {import("./view.js").default} dataParent
     */
    constructor(orient, stackSpacing, context, layoutParent, dataParent) {
        super(
            {
                name: "legend_region_" + orient,
                spacing: stackSpacing,
                vconcat: [],
            },
            context,
            layoutParent,
            dataParent,
            "legend_region_" + orient,
            {
                blockEncodingInheritance: true,
            }
        );

        this.needsAxes = { x: false, y: false };
        this.orient = orient;
        this.#stackSpacing = stackSpacing;

        markViewAsNonAddressable(this, { skipSubtree: true });
        markViewAsChrome(this, { skipSubtree: true });
    }

    async initializeChildren() {
        this.#child = await this.context.createOrImportView(
            {
                name: "legendStack",
                spacing: this.#stackSpacing,
                vconcat: [],
            },
            this,
            this,
            this.getNextAutoName("legendStack")
        );

        markViewAsNonAddressable(this.#child, { skipSubtree: true });
        markViewAsChrome(this.#child, { skipSubtree: true });
    }

    /**
     * @param {LegendView} legendView
     */
    addLegendView(legendView) {
        if (!this.#child) {
            throw new Error("Legend region has not been initialized!");
        }

        legendView.layoutParent =
            /** @type {import("./containerView.js").default} */ (this.#child);
        legendView.setStacked();
        this.#legendViews.push(legendView);
        /** @type {any} */ (this.#child).appendChildView(legendView);
    }

    /**
     * @returns {LegendView[]}
     */
    #getVisibleLegendViews() {
        return this.#legendViews.filter((legendView) => legendView.isActive());
    }

    /**
     * @returns {IterableIterator<import("./view.js").default>}
     */
    *[Symbol.iterator]() {
        if (this.#child) {
            yield this.#child;
        }
    }

    getSize() {
        const mainSize = { grow: 1 };
        const perpendicularSize = { px: this.getPerpendicularSize() };

        if (this.orient == "top" || this.orient == "bottom") {
            return new FlexDimensions(mainSize, perpendicularSize);
        } else {
            return new FlexDimensions(perpendicularSize, mainSize);
        }
    }

    getPerpendicularSize() {
        if (!this.#child) {
            return 0;
        }

        const legendViews = this.#getVisibleLegendViews();

        if (this.orient == "top" || this.orient == "bottom") {
            return legendViews.reduce(
                (sum, legendView, index) =>
                    sum +
                    legendView.getPerpendicularSize() +
                    (index > 0 ? this.#stackSpacing : 0),
                0
            );
        } else {
            return Math.max(
                0,
                ...legendViews.map((legendView) =>
                    legendView.getPerpendicularSize()
                )
            );
        }
    }

    getOffset() {
        return Math.max(
            0,
            ...this.#getVisibleLegendViews().map((legendView) =>
                legendView.getOffset()
            )
        );
    }

    getParallelSize() {
        const legendViews = this.#getVisibleLegendViews();
        if (
            legendViews.some((legendView) =>
                legendView.hasFlexibleParallelSize()
            )
        ) {
            return undefined;
        }

        return legendViews.reduce(
            (sum, legendView, index) =>
                sum +
                legendView.getStackedParallelSize() +
                (index > 0 ? this.#stackSpacing : 0),
            0
        );
    }

    isPickingSupported() {
        return false;
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
        this.#child?.render(context, coords, options);
        context.popView(this);
    }

    /**
     * @param {import("../utils/interaction.js").default} event
     */
    propagateInteraction(event) {
        this.handleInteraction(event, true);
        this.#child?.propagateInteraction(event);
        this.handleInteraction(event, false);
    }
}

export default class LegendView extends ContainerView {
    #effectiveExtent;

    /** @type {import("./view.js").default | undefined} */
    #child;

    /** @type {"symbol" | "gradient"} */
    #type;

    #stacked = false;

    /** @type {() => boolean} */
    #activePredicate = () => true;

    /** @type {MeasuredLabels | undefined} */
    #measuredLabels;

    #stackedParallelSize = 0;

    /** @type {UnitView[]} */
    #labelViews = [];

    /** @type {Set<import("../data/collector.js").default>} */
    #observedCollectors = new Set();

    #measurementScheduled = false;

    /**
     * @param {object} props
     * @param {LegendEntry[]} [props.entries]
     * @param {import("../spec/channel.js").ChannelWithScale} props.channel
     * @param {Partial<Record<import("../spec/channel.js").ChannelWithScale, string>>} [props.symbolChannels]
     * @param {SymbolLegendStyle} [props.symbolStyle]
     * @param {"point" | "stroke"} [props.symbolGeometry]
     * @param {"symbol" | "gradient"} [props.type]
     * @param {LegendConfig} props.legend
     * @param {string} [props.format]
     * @param {import("../spec/channel.js").Type} props.dataType
     * @param {import("../types/viewContext.js").default} context
     * @param {import("./containerView.js").default} layoutParent
     * @param {import("./view.js").default} dataParent
     * @param {import("./view.js").ViewOptions} [options]
     */
    constructor(
        {
            entries,
            channel,
            symbolChannels,
            symbolStyle,
            symbolGeometry,
            type,
            legend,
            format,
            dataType,
        },
        context,
        layoutParent,
        dataParent,
        options
    ) {
        const spec =
            type == "gradient"
                ? createGradientLegendSpec({
                      channel,
                      legend,
                      format,
                      context,
                  })
                : createSymbolLegendSpec({
                      entries,
                      channel,
                      symbolChannels,
                      symbolStyle,
                      symbolGeometry,
                      legend,
                      format,
                      dataType,
                      context,
                  });

        super(
            spec,
            context,
            layoutParent,
            dataParent,
            "legend_" + (legend.orient ?? "right"),
            {
                blockEncodingInheritance: true,
                ...options,
            }
        );

        this.needsAxes = { x: false, y: false };
        this.legendProps = legend;
        this.#type = type ?? "symbol";
        this.#effectiveExtent = getMinimumLegendExtent(
            this.#type,
            this.legendProps
        );

        markViewAsNonAddressable(this, { skipSubtree: true });
        markViewAsChrome(this, { skipSubtree: true });
    }

    async initializeChildren() {
        const childSpec = { ...this.spec };
        delete childSpec.name;

        this.#child = await this.context.createOrImportView(
            childSpec,
            this,
            this,
            this.getNextAutoName("legend"),
            undefined,
            {
                blockEncodingInheritance: true,
                // Generated legend internals use `width`/`height` expressions
                // for pixel-aware helper transforms and scales. Force local
                // layout params so authored specs that intentionally overload
                // these names, such as SampleView's sample-facet `height`, do
                // not leak into packLegendLabels or gradient scales. This should
                // become unnecessary once unit coordinate space has been
                // migrated to pixel space.
                layoutSizeParams: "force",
            }
        );

        markViewAsNonAddressable(this.#child, { skipSubtree: true });
        markViewAsChrome(this.#child, { skipSubtree: true });

        this.#labelViews = [];
        for (const view of this.getDescendants()) {
            if (
                view instanceof UnitView &&
                (view.name === "labels" || view.name === "gradientLabels")
            ) {
                this.#labelViews.push(view);
            }
        }

        if (this.#labelViews.length > 0) {
            this.registerDisposer(
                this._addBroadcastHandler("subtreeDataReady", () =>
                    this.#ensureLabelObservers()
                )
            );
        }
    }

    /**
     * @returns {IterableIterator<import("./view.js").default>}
     */
    *[Symbol.iterator]() {
        if (this.#child) {
            yield this.#child;
        }
    }

    getSize() {
        const mainSize = { grow: 1 };
        const perpendicularSize = { px: this.getPerpendicularSize() };

        if (this.#stacked) {
            const parallelSize = this.hasFlexibleParallelSize()
                ? { grow: 1 }
                : { px: this.getStackedParallelSize() };
            if (
                this.legendProps.orient == "top" ||
                this.legendProps.orient == "bottom"
            ) {
                return new FlexDimensions(mainSize, perpendicularSize);
            } else {
                return new FlexDimensions(perpendicularSize, parallelSize);
            }
        }

        if (
            this.legendProps.orient == "top" ||
            this.legendProps.orient == "bottom"
        ) {
            return new FlexDimensions(mainSize, perpendicularSize);
        } else {
            return new FlexDimensions(perpendicularSize, mainSize);
        }
    }

    hasFlexibleParallelSize() {
        return (
            this.#type == "gradient" && !isHorizontalLegend(this.legendProps)
        );
    }

    getPerpendicularSize() {
        return this.#effectiveExtent;
    }

    getOffset() {
        return this.legendProps.offset ?? 0;
    }

    /**
     * @param {() => boolean} predicate
     */
    setActivePredicate(predicate) {
        this.#activePredicate = predicate;
    }

    /*
     * Keep active visibility separate from configured visibility. View data
     * initialization uses isConfiguredVisible(), so reactive legend.disable
     * must not make the legend subtree look unconfigured. Otherwise a legend
     * that starts hidden would not initialize its marks and could not reappear.
     */
    isActive() {
        return super.isConfiguredVisible() && this.#activePredicate();
    }

    setStacked() {
        this.#stacked = true;
        this.#stackedParallelSize = this.getStackedParallelSize();
        this.invalidateSizeCache();
    }

    getStackedParallelSize() {
        const measuredLabels =
            this.#measuredLabels ?? getMeasuredLabels(this.#labelViews);

        return getStackedLegendParallelSize(
            this.legendProps,
            this.#type,
            measuredLabels,
            this.context
        );
    }

    #scheduleAutoExtentMeasurement() {
        if (this.#measurementScheduled) {
            return;
        }

        this.#measurementScheduled = true;
        queueMicrotask(() => {
            this.#measurementScheduled = false;
            this.#updateAutoExtent();
        });
    }

    #ensureLabelObservers() {
        for (const labelsView of this.#labelViews) {
            const collector = labelsView.getCollector();
            if (!collector || this.#observedCollectors.has(collector)) {
                continue;
            }

            this.#observedCollectors.add(collector);
            this.registerDisposer(
                collector.observe(() => this.#scheduleAutoExtentMeasurement())
            );

            if (collector.completed) {
                this.#scheduleAutoExtentMeasurement();
            }
        }
    }

    #updateAutoExtent() {
        const measuredLabels = getMeasuredLabels(this.#labelViews);
        if (measuredLabels === undefined) {
            return;
        }

        const previousStackedParallelSize = this.#stackedParallelSize;
        this.#measuredLabels = measuredLabels;

        const nextExtent = getLegendExtent(
            this.legendProps,
            this.#type,
            measuredLabels,
            this.context
        );
        const willGrow =
            nextExtent >= this.#effectiveExtent + AUTO_EXTENT_GROW_THRESHOLD_PX;
        const nextStackedParallelSize = this.getStackedParallelSize();
        const willResizeStack =
            this.#stacked &&
            Math.abs(nextStackedParallelSize - previousStackedParallelSize) >=
                AUTO_EXTENT_GROW_THRESHOLD_PX;

        if (!willGrow && !willResizeStack) {
            return;
        }

        if (willGrow) {
            this.#effectiveExtent = nextExtent;
        }
        this.#stackedParallelSize = nextStackedParallelSize;
        this.invalidateSizeCache();
        this.context.requestLayoutReflow();
    }

    isPickingSupported() {
        return false;
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext.js").default} context
     * @param {import("./layout/rectangle.js").default} coords
     * @param {import("../types/rendering.js").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        super.render(context, coords, options);

        if (!this.isActive()) {
            return;
        }

        context.pushView(this, coords);
        this.#child?.render(context, coords, options);
        context.popView(this);
    }

    /**
     * @param {import("../utils/interaction.js").default} event
     */
    propagateInteraction(event) {
        this.handleInteraction(event, true);
        this.#child?.propagateInteraction(event);
        this.handleInteraction(event, false);
    }
}

/**
 * @typedef {object} MeasuredLabels
 * @prop {number} maxWidth
 * @prop {number} maxEntryWidth
 * @prop {number} maxY
 */

/**
 * @param {UnitView[]} labelViews
 * @returns {MeasuredLabels | undefined}
 */
function getMeasuredLabels(labelViews) {
    let maxWidth = 0;
    let maxEntryWidth = 0;
    let maxY = 0;
    let completed = false;

    for (const labelsView of labelViews) {
        const collector = labelsView.getCollector();
        if (!collector?.completed) {
            return undefined;
        }

        completed = true;
        collector.visitData((datum) => {
            maxWidth = Math.max(
                maxWidth,
                Number(datum[LABEL_WIDTH_FIELD]) || 0
            );
            maxEntryWidth = Math.max(
                maxEntryWidth,
                Number(datum.entryWidth) || 0
            );
            maxY = Math.max(maxY, Number(datum.labelY) || 0);
        });
    }

    return completed
        ? {
              maxWidth: Math.ceil(maxWidth),
              maxEntryWidth: Math.ceil(maxEntryWidth),
              maxY: Math.ceil(maxY),
          }
        : undefined;
}

/**
 * @param {LegendConfig} legend
 * @param {"symbol" | "gradient"} type
 * @param {MeasuredLabels} measuredLabels
 * @param {import("../types/viewContext.js").default} context
 */
function getLegendExtent(legend, type, measuredLabels, context) {
    if (isHorizontalLegend(legend)) {
        return getHorizontalLegendExtent(legend, type, measuredLabels);
    }

    const titleWidth = isSideTitle(legend)
        ? getTitleWidthWithPadding(legend, context)
        : getTitleWidth(legend, context);
    const labelOffset = legend.labelOffset ?? 4;
    const labelExtent =
        type == "gradient"
            ? DEFAULT_GRADIENT_THICKNESS +
              DEFAULT_GRADIENT_TICK_SIZE +
              labelOffset +
              measuredLabels.maxWidth
            : measuredLabels.maxEntryWidth ||
              Math.sqrt(legend.symbolSize ?? 100) +
                  (legend.symbolStrokeWidth ?? 1.5) +
                  labelOffset +
                  measuredLabels.maxWidth;

    return Math.ceil(
        Math.max(
            getMinimumLegendExtent(type, legend),
            isSideTitle(legend) ? labelExtent + titleWidth : labelExtent,
            titleWidth
        )
    );
}

/**
 * @param {"symbol" | "gradient"} type
 * @param {LegendConfig} legend
 */
function getMinimumLegendExtent(type, legend) {
    if (isHorizontalLegend(legend)) {
        return type == "gradient" ? 32 : 0;
    } else {
        return 0;
    }
}

/**
 * @param {LegendConfig} legend
 * @param {"symbol" | "gradient"} type
 * @param {MeasuredLabels | undefined} measuredLabels
 * @param {import("../types/viewContext.js").default} context
 */
function getStackedLegendParallelSize(legend, type, measuredLabels, context) {
    const titleExtent = getParallelTitleExtent(legend, context);
    const titleSideBySide = isSideTitle(legend);
    const combine = (/** @type {number} */ bodyExtent) =>
        isHorizontalLegend(legend) == titleSideBySide
            ? Math.ceil(titleExtent + bodyExtent)
            : Math.ceil(Math.max(titleExtent, bodyExtent));

    if (type == "gradient") {
        return combine(DEFAULT_GRADIENT_LEGEND_LENGTH);
    } else if (measuredLabels) {
        const labelFontSize = legend.labelFontSize ?? 10;
        return combine(measuredLabels.maxY + labelFontSize / 2);
    } else {
        return combine(
            Math.sqrt(legend.symbolSize ?? 100) +
                (legend.symbolStrokeWidth ?? 1.5)
        );
    }
}

/**
 * @param {LegendConfig} legend
 * @param {"symbol" | "gradient"} type
 * @param {MeasuredLabels} measuredLabels
 */
function getHorizontalLegendExtent(legend, type, measuredLabels) {
    const labelFontSize = legend.labelFontSize ?? 10;
    const labelOffset = legend.labelOffset ?? 4;
    const titleExtent = getPerpendicularTitleExtent(legend);
    const bodyExtent =
        type == "gradient"
            ? labelFontSize +
              labelOffset +
              DEFAULT_GRADIENT_TICK_SIZE +
              DEFAULT_GRADIENT_THICKNESS +
              2
            : measuredLabels.maxY + labelFontSize / 2;

    return Math.ceil(
        Math.max(
            getMinimumLegendExtent(type, legend),
            isSideTitle(legend)
                ? Math.max(titleExtent, bodyExtent)
                : titleExtent + bodyExtent
        )
    );
}

/**
 * @param {LegendConfig} legend
 */
function getTitleHeight(legend) {
    return legend.title ? (legend.titleFontSize ?? 11) : 0;
}

/**
 * @param {LegendConfig} legend
 */
function getPerpendicularTitleExtent(legend) {
    return legend.title
        ? getTitleHeight(legend) +
              (isSideTitle(legend) ? 0 : (legend.titlePadding ?? 5))
        : 0;
}

/**
 * @param {LegendConfig} legend
 * @param {import("../types/viewContext.js").default} context
 */
function getParallelTitleExtent(legend, context) {
    return isSideTitle(legend)
        ? getTitleWidthWithPadding(legend, context)
        : getPerpendicularTitleExtent(legend);
}

/**
 * @param {LegendConfig} legend
 * @param {import("../types/viewContext.js").default} context
 */
function getTitleWidthWithPadding(legend, context) {
    return legend.title
        ? getTitleWidth(legend, context) + (legend.titlePadding ?? 5)
        : 0;
}

/**
 * @param {LegendConfig} legend
 * @param {import("../types/viewContext.js").default} context
 */
function getTitleWidth(legend, context) {
    if (!legend.title) {
        return 0;
    }

    const font = legend.titleFont
        ? context.fontManager.getFont(
              legend.titleFont,
              legend.titleFontStyle,
              legend.titleFontWeight
          )
        : context.fontManager.getDefaultFont();
    const metrics = font.metrics;
    if (!metrics) {
        return 0;
    }

    const fontSize = legend.titleFontSize ?? 11;
    const text = truncateText(
        legend.title,
        legend.titleLimit,
        metrics.measureWidth,
        fontSize,
        "..."
    );

    return metrics.measureWidth(text, fontSize);
}
