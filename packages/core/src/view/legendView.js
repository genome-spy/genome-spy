import LayerView from "./layerView.js";
import { FlexDimensions } from "./layout/flexLayout.js";
import { markViewAsChrome, markViewAsNonAddressable } from "./viewSelectors.js";

const LABEL_WIDTH_FIELD = "_legendLabelWidth";
const DEFAULT_LEGEND_EXTENT = 80;

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
     * @param {LegendConfig} props.legend
     * @param {import("../types/viewContext.js").default} context
     * @param {import("./containerView.js").default} layoutParent
     * @param {import("./view.js").default} dataParent
     * @param {import("./view.js").ViewOptions} [options]
     */
    constructor(
        { entries, scaleName, channel, symbolChannels, legend },
        context,
        layoutParent,
        dataParent,
        options
    ) {
        super(
            createSymbolLegendSpec({
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
