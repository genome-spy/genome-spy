import LayerView from "./layerView.js";
import { FlexDimensions } from "./layout/flexLayout.js";
import { markViewAsChrome, markViewAsNonAddressable } from "./viewSelectors.js";

const LABEL_WIDTH_FIELD = "_legendLabelWidth";

/**
 * @typedef {import("../spec/legend.js").LegendConfig} LegendConfig
 * @typedef {import("./legend/legendEntries.js").LegendEntry} LegendEntry
 */

/**
 * @param {object} options
 * @param {LegendEntry[]} options.entries
 * @param {string} options.scaleName
 * @param {import("../spec/channel.js").ChannelWithScale} options.channel
 * @param {LegendConfig} options.legend
 * @returns {import("../spec/view.js").LayerSpec}
 */
export function createSymbolLegendSpec({
    entries,
    scaleName,
    channel,
    legend,
}) {
    const title = legend.title;
    const orient = legend.orient ?? "right";
    const labelAlign = legend.labelAlign ?? "left";
    const labelBaseline = legend.labelBaseline ?? "middle";
    const labelFontSize = legend.labelFontSize ?? 10;

    /** @type {import("../spec/view.js").UnitSpec[]} */
    const layer = [
        {
            name: "symbols",
            mark: {
                type: "point",
                clip: false,
                filled: false,
                shape: legend.symbolType,
                size: legend.symbolSize,
                strokeWidth: legend.symbolStrokeWidth,
            },
            encoding: {
                x: {
                    field: "_legendEntryX",
                    type: "quantitative",
                    scale: null,
                },
                y: {
                    field: "_legendLabelY",
                    type: "quantitative",
                    scale: null,
                },
                [channel]: {
                    field: "value",
                    type: "nominal",
                    scale: { name: scaleName },
                },
            },
        },
    ];

    if (title) {
        layer.push({
            name: "title",
            data: { values: [{}] },
            mark: {
                type: "text",
                clip: false,
                align: labelAlign,
                baseline: labelBaseline,
                color: legend.titleColor,
                font: legend.titleFont,
                fontStyle: legend.titleFontStyle,
                fontWeight: legend.titleFontWeight,
                size: legend.titleFontSize,
                text: title,
            },
        });
    }

    layer.push({
        name: "labels",
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
                field: "_legendLabelX",
                type: "quantitative",
                scale: null,
            },
            y: {
                field: "_legendLabelY",
                type: "quantitative",
                scale: null,
            },
            text: { field: "label" },
        },
    });

    return {
        name: "legend_" + orient,
        data: { values: entries },
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
            },
        ],
        layer,
    };
}

export default class LegendView extends LayerView {
    /**
     * @param {object} props
     * @param {LegendEntry[]} props.entries
     * @param {string} props.scaleName
     * @param {import("../spec/channel.js").ChannelWithScale} props.channel
     * @param {LegendConfig} props.legend
     * @param {import("../types/viewContext.js").default} context
     * @param {import("./containerView.js").default} layoutParent
     * @param {import("./view.js").default} dataParent
     * @param {import("./view.js").ViewOptions} [options]
     */
    constructor(
        { entries, scaleName, channel, legend },
        context,
        layoutParent,
        dataParent,
        options
    ) {
        super(
            createSymbolLegendSpec({ entries, scaleName, channel, legend }),
            context,
            layoutParent,
            dataParent,
            "legend_" + (legend.orient ?? "right"),
            {
                blockEncodingInheritance: true,
                ...options,
            }
        );

        this.legendProps = legend;

        markViewAsNonAddressable(this, { skipSubtree: true });
        markViewAsChrome(this, { skipSubtree: true });
    }

    getSize() {
        // Conservative placeholder until legend extent measurement is wired.
        return new FlexDimensions({ px: 0 }, { px: 0 });
    }

    isPickingSupported() {
        return false;
    }
}
