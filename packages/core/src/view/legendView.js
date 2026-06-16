import ContainerView from "./containerView.js";
import { FlexDimensions } from "./layout/flexLayout.js";
import { markViewAsChrome, markViewAsNonAddressable } from "./viewSelectors.js";

const LABEL_WIDTH_FIELD = "_legendLabelWidth";
const DEFAULT_LEGEND_EXTENT = 80;
const DEFAULT_GRADIENT_SAMPLE_COUNT = 64;
const DEFAULT_GRADIENT_TICK_COUNT = 5;
const DEFAULT_GRADIENT_THICKNESS = 12;
const DEFAULT_GRADIENT_TICK_SIZE = 4;
const CONTINUOUS_GRADIENT_SCALE_TYPES = new Set([
    "linear",
    "log",
    "pow",
    "sqrt",
    "symlog",
]);
const DISCRETIZING_GRADIENT_SCALE_TYPES = new Set(["quantize", "threshold"]);
/** @type {import("../spec/view.js").ViewBackground} */
const LEGEND_VIEW_BACKGROUND = {
    fillOpacity: 0,
    shadowOpacity: 0,
    strokeOpacity: 0,
};

/**
 * @typedef {import("../spec/legend.js").LegendConfig} LegendConfig
 * @typedef {import("./legend/legendEntries.js").LegendEntry} LegendEntry
 */

/**
 * @param {LegendConfig} legend
 * @returns {import("../spec/view.js").UnitSpec | undefined}
 */
function createLegendTitleSpec(legend) {
    const title = legend.title;

    if (!title) {
        return undefined;
    }

    const titleFontSize = legend.titleFontSize ?? 11;
    const titlePadding = legend.titlePadding ?? 5;

    return {
        name: "title",
        height: titleFontSize + titlePadding,
        view: LEGEND_VIEW_BACKGROUND,
        data: {
            values: [{}],
        },
        mark: {
            type: "text",
            clip: false,
            x: 0,
            y: 0.5,
            align: "left",
            baseline: "middle",
            color: legend.titleColor,
            font: legend.titleFont,
            fontStyle: legend.titleFontStyle,
            fontWeight: legend.titleFontWeight,
            size: titleFontSize,
            text: title,
        },
    };
}

/**
 * @param {LegendConfig} legend
 * @param {import("../spec/view.js").ViewSpec} body
 * @returns {import("../spec/view.js").VConcatSpec}
 */
function createLegendRootSpec(legend, body) {
    const title = createLegendTitleSpec(legend);

    return {
        name: "legend_" + (legend.orient ?? "right"),
        spacing: 0,
        vconcat: title ? [title, body] : [body],
    };
}

/**
 * @param {import("../spec/scale.js").Scale | undefined} scaleProps
 * @returns {import("../spec/scale.js").Scale}
 */
function createGradientPositionScale(scaleProps) {
    const type = scaleProps?.type;
    /** @type {import("../spec/scale.js").Scale} */
    const copiedProps = {};
    if (type && CONTINUOUS_GRADIENT_SCALE_TYPES.has(type)) {
        copiedProps.type = type;
        if (scaleProps.base !== undefined) {
            copiedProps.base = scaleProps.base;
        }
        if (scaleProps.exponent !== undefined) {
            copiedProps.exponent = scaleProps.exponent;
        }
        if (scaleProps.constant !== undefined) {
            copiedProps.constant = scaleProps.constant;
        }
        if (scaleProps.clamp !== undefined) {
            copiedProps.clamp = scaleProps.clamp;
        }
        if (scaleProps.reverse !== undefined) {
            copiedProps.reverse = scaleProps.reverse;
        }
    }

    return {
        ...copiedProps,
        domainTransition: false,
        zero: false,
        nice: false,
    };
}

/**
 * @param {object} options
 * @param {string} options.scaleName
 * @param {import("../spec/scale.js").Scale | undefined} options.scaleProps
 * @returns {import("../spec/scale.js").Scale}
 */
function createGradientColorScale({ scaleName, scaleProps }) {
    /** @type {import("../spec/scale.js").Scale} */
    const copiedProps = scaleProps ? { ...scaleProps } : {};
    if (!DISCRETIZING_GRADIENT_SCALE_TYPES.has(copiedProps.type ?? "")) {
        delete copiedProps.domain;
        delete copiedProps.domainMin;
        delete copiedProps.domainMax;
    }
    delete copiedProps.name;

    return {
        ...copiedProps,
        name: scaleName,
        domainTransition: false,
        zero: false,
        nice: false,
    };
}

/**
 * @param {object} options
 * @param {LegendEntry[]} [options.entries]
 * @param {string} options.scaleName
 * @param {import("../spec/channel.js").ChannelWithScale} options.channel
 * @param {Partial<Record<import("../spec/channel.js").ChannelWithScale, string>>} [options.symbolChannels]
 * @param {LegendConfig} options.legend
 * @returns {import("../spec/view.js").VConcatSpec}
 */
export function createSymbolLegendSpec({
    entries,
    scaleName,
    channel,
    symbolChannels = {},
    legend,
}) {
    const labelAlign = legend.labelAlign ?? "left";
    const labelBaseline = legend.labelBaseline ?? "middle";
    const labelFontSize = legend.labelFontSize ?? 10;
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

    return createLegendRootSpec(legend, {
        name: "legendBody",
        height: { grow: 1 },
        view: LEGEND_VIEW_BACKGROUND,
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
                yOffset: 0,
                yExtent: { expr: "height" },
            },
        ],
        layer,
    });
}

/**
 * @param {object} options
 * @param {string} options.scaleName
 * @param {import("../spec/channel.js").ChannelWithScale} options.channel
 * @param {import("../spec/scale.js").Scale} [options.scaleProps]
 * @param {LegendConfig} options.legend
 * @returns {import("../spec/view.js").VConcatSpec}
 */
export function createGradientLegendSpec({
    scaleName,
    channel,
    scaleProps,
    legend,
}) {
    const labelAlign = legend.labelAlign ?? "left";
    const labelBaseline = legend.labelBaseline ?? "middle";
    const labelFontSize = legend.labelFontSize ?? 10;
    const labelOffset = legend.labelOffset ?? 4;
    const horizontalPixelScale = {
        domain: [0, { expr: "width" }],
        zero: false,
        nice: false,
    };
    const verticalDomainScale = createGradientPositionScale(scaleProps);
    const colorDomainScale = createGradientColorScale({
        scaleName,
        scaleProps,
    });
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
    const bodyLayer = [
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
                    field: "value1",
                    type: "quantitative",
                    scale: verticalDomainScale,
                    axis: null,
                },
                y2: {
                    field: "value0",
                    type: "quantitative",
                    scale: verticalDomainScale,
                },
                [channel]: {
                    field: "value",
                    type: "quantitative",
                    scale: colorDomainScale,
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
                    field: "value",
                    type: "quantitative",
                    scale: verticalDomainScale,
                    axis: null,
                },
                y2: {
                    field: "value",
                    type: "quantitative",
                    scale: verticalDomainScale,
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
                    field: "value",
                    type: "quantitative",
                    scale: verticalDomainScale,
                    axis: null,
                },
                text: { field: "label" },
            },
        },
    ];

    return createLegendRootSpec(legend, {
        name: "gradientBody",
        height: { grow: 1 },
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
    });
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

export default class LegendView extends ContainerView {
    #effectiveExtent = DEFAULT_LEGEND_EXTENT;

    /** @type {import("./view.js").default | undefined} */
    #child;

    /**
     * @param {object} props
     * @param {LegendEntry[]} [props.entries]
     * @param {string} props.scaleName
     * @param {import("../spec/channel.js").ChannelWithScale} props.channel
     * @param {import("../spec/scale.js").Scale} [props.scaleProps]
     * @param {Partial<Record<import("../spec/channel.js").ChannelWithScale, string>>} [props.symbolChannels]
     * @param {"symbol" | "gradient"} [props.type]
     * @param {LegendConfig} props.legend
     * @param {import("../types/viewContext.js").default} context
     * @param {import("./containerView.js").default} layoutParent
     * @param {import("./view.js").default} dataParent
     * @param {import("./view.js").ViewOptions} [options]
     */
    constructor(
        {
            entries,
            scaleName,
            channel,
            scaleProps,
            symbolChannels,
            type,
            legend,
        },
        context,
        layoutParent,
        dataParent,
        options
    ) {
        const spec =
            type == "gradient"
                ? createGradientLegendSpec({
                      scaleName,
                      channel,
                      scaleProps,
                      legend,
                  })
                : createSymbolLegendSpec({
                      entries,
                      scaleName,
                      channel,
                      symbolChannels,
                      legend,
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
            this.getNextAutoName("legend")
        );

        markViewAsNonAddressable(this.#child, { skipSubtree: true });
        markViewAsChrome(this.#child, { skipSubtree: true });
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
