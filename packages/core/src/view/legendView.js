import LayerView from "./layerView.js";
import { FlexDimensions } from "./layout/flexLayout.js";
import { markViewAsChrome, markViewAsNonAddressable } from "./viewSelectors.js";

const LABEL_WIDTH_FIELD = "_legendLabelWidth";
const DEFAULT_LEGEND_EXTENT = 80;
const DEFAULT_GRADIENT_SAMPLE_COUNT = 64;
const DEFAULT_GRADIENT_TICK_COUNT = 5;
const DEFAULT_GRADIENT_THICKNESS = 12;
const DEFAULT_GRADIENT_TICK_SIZE = 4;

/**
 * @typedef {import("../spec/legend.js").LegendConfig} LegendConfig
 * @typedef {import("./legend/legendEntries.js").LegendEntry} LegendEntry
 */

/**
 * @param {object} options
 * @param {LegendEntry[]} [options.entries]
 * @param {string} options.scaleName
 * @param {import("../spec/channel.js").ChannelWithScale} options.channel
 * @param {Partial<Record<import("../spec/channel.js").ChannelWithScale, string>>} [options.symbolChannels]
 * @param {LegendConfig} options.legend
 * @returns {import("../spec/view.js").LayerSpec}
 */
export function createSymbolLegendSpec({
    entries,
    scaleName,
    channel,
    symbolChannels = {},
    legend,
}) {
    const title = legend.title;
    const orient = legend.orient ?? "right";
    const labelAlign = legend.labelAlign ?? "left";
    const labelBaseline = legend.labelBaseline ?? "middle";
    const labelFontSize = legend.labelFontSize ?? 10;
    const titleFontSize = legend.titleFontSize ?? 11;
    const titlePadding = legend.titlePadding ?? 5;
    const entryYOffset = title ? titleFontSize + titlePadding : 0;
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
        {
            name: "symbols",
            mark: {
                type: "point",
                clip: false,
                cullByVisibleRange: false,
                filled: false,
                shape: legend.symbolType,
                size: legend.symbolSize,
                strokeWidth: legend.symbolStrokeWidth,
            },
            encoding: {
                x: {
                    field: "_legendEntryX",
                    type: "quantitative",
                    scale: horizontalPixelScale,
                    axis: null,
                    buildIndex: false,
                },
                y: {
                    field: "_legendLabelY2",
                    type: "quantitative",
                    scale: verticalPixelScale,
                    axis: null,
                },
                [channel]: {
                    field: "value",
                    type: "nominal",
                    scale: { name: scaleName },
                },
                ...Object.fromEntries(
                    Object.entries(symbolChannels).map(
                        ([channel, scaleName]) => [
                            channel,
                            {
                                field: "value",
                                type: "nominal",
                                scale: { name: scaleName },
                            },
                        ]
                    )
                ),
            },
        },
    ];

    if (title) {
        layer.push({
            name: "title",
            data: {
                values: [
                    {
                        _legendTitleX: 0,
                        _legendTitleOffset: titleFontSize / 2,
                    },
                ],
            },
            transform: [
                {
                    type: "formula",
                    expr: "height - datum._legendTitleOffset",
                    as: "_legendTitleY2",
                },
            ],
            mark: {
                type: "text",
                clip: false,
                align: labelAlign,
                baseline: labelBaseline,
                color: legend.titleColor,
                font: legend.titleFont,
                fontStyle: legend.titleFontStyle,
                fontWeight: legend.titleFontWeight,
                size: titleFontSize,
                text: title,
            },
            encoding: {
                x: {
                    field: "_legendTitleX",
                    type: "quantitative",
                    scale: horizontalPixelScale,
                    axis: null,
                    buildIndex: false,
                },
                y: {
                    field: "_legendTitleY2",
                    type: "quantitative",
                    scale: verticalPixelScale,
                    axis: null,
                },
            },
        });
    }

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
                field: "_legendLabelX",
                type: "quantitative",
                scale: horizontalPixelScale,
                axis: null,
                buildIndex: false,
            },
            y: {
                field: "_legendLabelY2",
                type: "quantitative",
                scale: verticalPixelScale,
                axis: null,
            },
            text: { field: "label" },
        },
    });

    return {
        name: "legend_" + orient,
        resolve: {
            scale: { x: "excluded", y: "excluded" },
            axis: { x: "excluded", y: "excluded" },
        },
        data: entries
            ? { values: entries }
            : { lazy: { type: "legendEntries", channel } },
        transform: [
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
                type: "packLabels",
                labelWidth: LABEL_WIDTH_FIELD,
                direction: legend.direction,
                columns: legend.columns,
                symbolSize: legend.symbolSize,
                symbolStrokeWidth: legend.symbolStrokeWidth,
                labelOffset: legend.labelOffset,
                fontSize: labelFontSize,
                rowPadding: legend.rowPadding,
                columnPadding: legend.columnPadding,
                yOffset: entryYOffset,
                yExtent: { expr: "height" },
            },
        ],
        layer,
    };
}

/**
 * @param {object} options
 * @param {string} options.scaleName
 * @param {import("../spec/channel.js").ChannelWithScale} options.channel
 * @param {LegendConfig} options.legend
 * @returns {import("../spec/view.js").LayerSpec}
 */
export function createGradientLegendSpec({ scaleName, channel, legend }) {
    const title = legend.title;
    const orient = legend.orient ?? "right";
    const labelAlign = legend.labelAlign ?? "left";
    const labelBaseline = legend.labelBaseline ?? "middle";
    const labelFontSize = legend.labelFontSize ?? 10;
    const titleFontSize = legend.titleFontSize ?? 11;
    const titlePadding = legend.titlePadding ?? 5;
    const entryYOffset = title ? titleFontSize + titlePadding : 0;
    const labelOffset = legend.labelOffset ?? 4;
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
    const rampHeightExpr = `(height - ${entryYOffset})`;
    const tickX = DEFAULT_GRADIENT_THICKNESS;
    const tickX2 = DEFAULT_GRADIENT_THICKNESS + DEFAULT_GRADIENT_TICK_SIZE;
    const labelX = tickX2 + labelOffset;
    /** @type {import("../spec/data.js").Data} */
    const tickData = {
        lazy: {
            type: "legendGradientTicks",
            channel,
            count: DEFAULT_GRADIENT_TICK_COUNT,
        },
    };
    /** @type {import("../spec/transform.js").TransformParams[]} */
    const tickTransform = [
        {
            type: "formula",
            expr: `${rampHeightExpr} * datum._legendGradientT`,
            as: "_legendGradientTickY",
        },
        {
            type: "formula",
            expr: "" + tickX,
            as: "_legendGradientTickX",
        },
        {
            type: "formula",
            expr: "" + tickX2,
            as: "_legendGradientTickX2",
        },
        {
            type: "formula",
            expr: "" + labelX,
            as: "_legendGradientLabelX",
        },
    ];

    /** @type {import("../spec/view.js").UnitSpec[]} */
    const layer = [
        {
            name: "gradientRamp",
            transform: [
                {
                    type: "formula",
                    expr: "0",
                    as: "_legendGradientX",
                },
                {
                    type: "formula",
                    expr: "" + DEFAULT_GRADIENT_THICKNESS,
                    as: "_legendGradientX2",
                },
                {
                    type: "formula",
                    expr: `${rampHeightExpr} * datum._legendGradientT0`,
                    as: "_legendGradientY",
                },
                {
                    type: "formula",
                    expr: `${rampHeightExpr} * datum._legendGradientT1`,
                    as: "_legendGradientY2",
                },
            ],
            mark: {
                type: "rect",
                clip: false,
            },
            encoding: {
                x: {
                    field: "_legendGradientX",
                    type: "quantitative",
                    scale: horizontalPixelScale,
                    axis: null,
                    buildIndex: false,
                },
                x2: {
                    field: "_legendGradientX2",
                    type: "quantitative",
                    scale: horizontalPixelScale,
                },
                y: {
                    field: "_legendGradientY2",
                    type: "quantitative",
                    scale: verticalPixelScale,
                    axis: null,
                },
                y2: {
                    field: "_legendGradientY",
                    type: "quantitative",
                    scale: verticalPixelScale,
                },
                [channel]: {
                    field: "value",
                    type: "quantitative",
                    scale: { name: scaleName },
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
                x: {
                    field: "_legendGradientTickX",
                    type: "quantitative",
                    scale: horizontalPixelScale,
                    axis: null,
                    buildIndex: false,
                },
                x2: {
                    field: "_legendGradientTickX2",
                    type: "quantitative",
                    scale: horizontalPixelScale,
                },
                y: {
                    field: "_legendGradientTickY",
                    type: "quantitative",
                    scale: verticalPixelScale,
                    axis: null,
                },
                y2: {
                    field: "_legendGradientTickY",
                    type: "quantitative",
                    scale: verticalPixelScale,
                },
            },
        },
        {
            name: "gradientLabels",
            data: tickData,
            transform: tickTransform,
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
                x: {
                    field: "_legendGradientLabelX",
                    type: "quantitative",
                    scale: horizontalPixelScale,
                    axis: null,
                    buildIndex: false,
                },
                y: {
                    field: "_legendGradientTickY",
                    type: "quantitative",
                    scale: verticalPixelScale,
                    axis: null,
                },
                text: { field: "label" },
            },
        },
    ];

    if (title) {
        layer.push({
            name: "title",
            data: {
                values: [
                    {
                        _legendTitleX: 0,
                        _legendTitleOffset: titleFontSize / 2,
                    },
                ],
            },
            transform: [
                {
                    type: "formula",
                    expr: "height - datum._legendTitleOffset",
                    as: "_legendTitleY2",
                },
            ],
            mark: {
                type: "text",
                clip: false,
                align: labelAlign,
                baseline: labelBaseline,
                color: legend.titleColor,
                font: legend.titleFont,
                fontStyle: legend.titleFontStyle,
                fontWeight: legend.titleFontWeight,
                size: titleFontSize,
                text: title,
            },
            encoding: {
                x: {
                    field: "_legendTitleX",
                    type: "quantitative",
                    scale: horizontalPixelScale,
                    axis: null,
                    buildIndex: false,
                },
                y: {
                    field: "_legendTitleY2",
                    type: "quantitative",
                    scale: verticalPixelScale,
                    axis: null,
                },
            },
        });
    }

    return {
        name: "legend_" + orient,
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
        layer,
    };
}

/**
 * @param {LegendView | undefined} legendView
 * @returns {number}
 */
export function getExternalLegendOverhang(legendView) {
    return legendView
        ? legendView.getPerpendicularSize() + legendView.getExternalPadding()
        : 0;
}

export default class LegendView extends LayerView {
    #effectiveExtent = DEFAULT_LEGEND_EXTENT;

    /**
     * @param {object} props
     * @param {LegendEntry[]} [props.entries]
     * @param {string} props.scaleName
     * @param {import("../spec/channel.js").ChannelWithScale} props.channel
     * @param {Partial<Record<import("../spec/channel.js").ChannelWithScale, string>>} [props.symbolChannels]
     * @param {"symbol" | "gradient"} [props.type]
     * @param {LegendConfig} props.legend
     * @param {import("../types/viewContext.js").default} context
     * @param {import("./containerView.js").default} layoutParent
     * @param {import("./view.js").default} dataParent
     * @param {import("./view.js").ViewOptions} [options]
     */
    constructor(
        { entries, scaleName, channel, symbolChannels, type, legend },
        context,
        layoutParent,
        dataParent,
        options
    ) {
        super(
            type == "gradient"
                ? createGradientLegendSpec({ scaleName, channel, legend })
                : createSymbolLegendSpec({
                      entries,
                      scaleName,
                      channel,
                      symbolChannels,
                      legend,
                  }),
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

        markViewAsNonAddressable(this, { skipSubtree: true });
        markViewAsChrome(this, { skipSubtree: true });
    }

    getSize() {
        const mainSize = { grow: 1 };
        const perpendicularSize = { px: this.getPerpendicularSize() };

        if (
            this.legendProps.orient == "top" ||
            this.legendProps.orient == "bottom"
        ) {
            return new FlexDimensions(mainSize, perpendicularSize);
        } else {
            return new FlexDimensions(perpendicularSize, mainSize);
        }
    }

    getPerpendicularSize() {
        return this.#effectiveExtent;
    }

    getExternalPadding() {
        return this.legendProps.padding ?? 0;
    }

    isPickingSupported() {
        return false;
    }
}
