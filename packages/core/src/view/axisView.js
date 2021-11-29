import { validTicks, tickValues, tickFormat, tickCount } from "../scale/ticks";
import LayerView from "./layerView";
import { isNumber } from "vega-util";
import smoothstep from "../utils/smoothstep";
import {
    shallowArrayEquals,
    shallowArrayEqualsWithAccessors,
} from "../utils/arrayUtils";
import { FlexDimensions } from "../utils/layout/flexLayout";
import DynamicCallbackSource from "../data/sources/dynamicCallbackSource";

const CHROM_LAYER_NAME = "chromosome_ticks_and_labels";

/**
 * @typedef {import("../spec/channel").PrimaryPositionalChannel} PositionalChannel
 * @typedef {import("../spec/view").GeometricDimension} GeometricDimension
 */

/** @type {Record<PositionalChannel, GeometricDimension>} */
const CHANNEL_DIMENSIONS = {
    x: "width",
    y: "height",
};

/**
 * @param {PositionalChannel} channel
 * @returns {PositionalChannel}
 */
function getPerpendicularChannel(channel) {
    return channel == "x" ? "y" : "x";
}

/** @type {Record<PositionalChannel, AxisOrient[]>} */
const CHANNEL_ORIENTS = {
    x: ["bottom", "top"],
    y: ["left", "right"],
};

/** @type {Record<AxisOrient, PositionalChannel>} */
const ORIENT_CHANNELS = Object.fromEntries(
    Object.entries(CHANNEL_ORIENTS)
        .map(([channel, slots]) => slots.map((slot) => [slot, channel]))
        .flat(1)
);
/**
 * @param {AxisOrient} slot
 */
function orient2channel(slot) {
    return ORIENT_CHANNELS[slot];
}

/**
 * An internal view that renders an axis.
 *
 * TODO: Implement grid
 *
 * @typedef {import("../spec/view").LayerSpec} LayerSpec
 * @typedef {import("./view").default} View
 * @typedef {import("../spec/axis").Axis} Axis
 * @typedef {import("../spec/axis").GenomeAxis} GenomeAxis
 * @typedef {import("../spec/axis").AxisOrient} AxisOrient
 * @typedef {import("../utils/layout/flexLayout").SizeDef} SizeDef
 *
 * @typedef {Axis & { extent: number }} AugmentedAxis
 */
export default class AxisView extends LayerView {
    /**
     * @param {Axis} axisProps
     * @param {import("./viewUtils").ViewContext} context
     * @param {string} type Data type (quantitative, ..., locus)
     * @param {import("./containerView").default} parent
     */
    constructor(axisProps, type, context, parent) {
        // Now the presence of genomeAxis is based on field type, not scale type.
        // TODO: Use scale instead. However, it would make the initialization much more
        // complex because scales are not available before scale resolution.
        const genomeAxis = type == "locus";

        // TODO: Compute extent

        /** @type {Axis | GenomeAxis} */
        const fullAxisProps = {
            ...(genomeAxis ? defaultGenomeAxisProps : defaultAxisProps),
            ...getDefaultAngleAndAlign(type, axisProps),
            ...axisProps,
        };

        super(
            genomeAxis
                ? createGenomeAxis(fullAxisProps)
                : createAxis(fullAxisProps),
            context,
            parent,
            `axis_${axisProps.orient}`
        );

        this.axisProps = fullAxisProps;

        /** Axis should be updated before next render */
        this.axisUpdateRequested = true;

        this._addBroadcastHandler("layout", () => {
            this.axisUpdateRequested = true;
        });

        /** @type {any[]} */
        this.previousScaleDomain = [];

        /** @type {number} TODO: Take from scal*/
        this.axisLength = undefined;

        /** @type {TickDatum[]} */
        this.ticks = [];

        this.tickSource = new DynamicCallbackSource(() => this.ticks);

        if (genomeAxis) {
            const channel = orient2channel(this.axisProps.orient);
            const genome = this.getScaleResolution(channel).getGenome();
            this.findChildByName(CHROM_LAYER_NAME).getDynamicDataSource = () =>
                new DynamicCallbackSource(() => genome.chromosomes);
        }
    }

    getOrient() {
        return this.axisProps.orient;
    }

    getSize() {
        /** @type {SizeDef} */
        const perpendicularSize = { px: this.getPerpendicularSize() };

        /** @type {SizeDef} */
        const mainSize = { grow: 1 };

        if (ORIENT_CHANNELS[this.axisProps.orient] == "x") {
            return new FlexDimensions(mainSize, perpendicularSize);
        } else {
            return new FlexDimensions(perpendicularSize, mainSize);
        }
    }

    getPerpendicularSize() {
        return getExtent(this.axisProps);
    }

    getDynamicDataSource() {
        return this.tickSource;
    }

    _updateAxisData() {
        // TODO: This could be a transform that generates ticks on the fly
        // Would allow for unlimited customization.

        const channel = orient2channel(this.axisProps.orient);
        const scale = this.getScaleResolution(channel).getScale();
        const currentScaleDomain = scale.domain();

        if (
            shallowArrayEquals(currentScaleDomain, this.previousScaleDomain) &&
            !this.axisUpdateRequested
        ) {
            // TODO: Instead of scale comparison, register an observer to Resolution
            return;
        }
        this.previousScaleDomain = currentScaleDomain;

        const oldTicks = this.ticks;
        const newTicks = generateTicks(
            this.axisProps,
            scale,
            this.axisLength,
            oldTicks
        );

        if (newTicks !== oldTicks) {
            this.ticks = newTicks;
            this.tickSource.loadSynchronously();
        }

        this.axisUpdateRequested = false;
    }

    onBeforeRender() {
        super.onBeforeRender();
        this._updateAxisData();
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext").default} context
     * @param {import("../utils/layout/rectangle").default} coords
     * @param {import("./view").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        if (!this.isVisible()) {
            return;
        }

        this.axisLength =
            coords[CHANNEL_DIMENSIONS[orient2channel(this.getOrient())]];

        super.render(context, coords, options);
    }

    isPickingSupported() {
        return false;
    }
}

/**
 * @param {Axis} axisProps
 */
function getExtent(axisProps) {
    const mainChannel = orient2channel(axisProps.orient);

    /** @type {number} */
    let extent = (axisProps.ticks && axisProps.tickSize) || 0;

    if (axisProps.labels) {
        extent += axisProps.labelPadding;
        if (mainChannel == "x") {
            extent += axisProps.labelFontSize;
        } else {
            extent += 30; // TODO: Measure label lengths!
        }
    }
    if (axisProps.title) {
        extent += axisProps.titlePadding + axisProps.titleFontSize;
    }

    // TODO: Include chrom ticks and labels!

    extent = Math.min(
        axisProps.maxExtent || Infinity,
        Math.max(axisProps.minExtent || 0, extent)
    );

    return extent;
}

/**
 * @param {Axis} axisProps
 * @param {any} scale
 * @param {number} axisLength Length of axis in pixels
 * @param {TickDatum[]} [oldTicks] Reuse the old data if the tick values are identical
 * @returns {TickDatum[]}
 *
 * @typedef {object} TickDatum
 * @prop {number} value
 * @prop {string} label
 */
function generateTicks(axisProps, scale, axisLength, oldTicks = []) {
    /**
     * Make ticks more dense in small plots
     *
     * @param {number} length
     */
    const tickSpacing = (length) => 25 + 60 * smoothstep(100, 700, length);

    let count = isNumber(axisProps.tickCount)
        ? axisProps.tickCount
        : Math.round(axisLength / tickSpacing(axisLength));

    count = tickCount(scale, count, axisProps.tickMinStep);

    const values = axisProps.values
        ? validTicks(scale, axisProps.values, count)
        : tickValues(scale, count);

    if (
        shallowArrayEqualsWithAccessors(
            values,
            oldTicks,
            (v) => v,
            (d) => d.value
        )
    ) {
        return oldTicks;
    } else {
        const format = tickFormat(scale, count, axisProps.format);

        return values.map((x) => ({ value: x, label: format(x) }));
    }
}

// Based on: https://vega.github.io/vega-lite/docs/axis.html
// TODO: The defaults should be taken from config (theme)
/** @type {Axis} */
const defaultAxisProps = {
    values: null,

    minExtent: 20,
    maxExtent: Infinity,
    offset: 0, // TODO: Implement

    domain: true,
    domainWidth: 1,
    domainColor: "gray",
    domainDash: null,
    domainDashOffset: 0,
    domainCap: "square", // Make 1px caps crisp

    ticks: true,
    tickSize: 5,
    tickWidth: 1,
    tickColor: "gray",
    tickDash: null,
    tickDashOffset: 0,
    tickCap: "square", // Make 1px caps crisp

    // TODO: tickBand

    tickCount: null,
    tickMinStep: null,

    labels: true,
    labelAlign: "center",
    labelBaseline: "middle",
    labelPadding: 4,
    labelFontSize: 10,
    labelLimit: 180, // TODO
    labelColor: "black",
    format: null,

    titleColor: "black",
    titleFont: "sans-serif",
    titleFontSize: 10,
    titlePadding: 3,

    // TODO: titleX, titleY, titleAngle, titleAlign, etc
};

/**
 * @param {string} type
 * @param {Axis} axisProps
 */
function getDefaultAngleAndAlign(type, axisProps) {
    const orient = axisProps.orient;
    const discrete = type == "nominal" || type == "ordinal";

    /** @type {import("../spec/font").Align} */
    let align = "center";
    /** @type {import("../spec/font").Baseline} */
    let baseline = "middle";

    /** @type {number} */
    let angle =
        axisProps.labelAngle ??
        ((orient == "top" || orient == "bottom") && discrete ? -90 : 0);

    // TODO: Setting labelAngle of left or right axis to 90 or -90 should center the labels

    switch (orient) {
        case "left":
            align = "right";
            break;
        case "right":
            align = "left";
            break;
        case "top":
        case "bottom":
            if (Math.abs(angle) > 30) {
                align = angle > 0 === (orient == "bottom") ? "left" : "right";
                baseline = "middle";
            } else {
                baseline = orient == "top" ? "alphabetic" : "top";
            }
            break;
        default:
    }

    return {
        labelAlign: align,
        labelAngle: angle,
        labelBaseline: baseline,
    };
}

/**
 * @param {Axis} axisProps
 * @returns {LayerSpec}
 */
function createAxis(axisProps) {
    // TODO: Ensure that no channels except the positional ones are shared

    const ap = { ...axisProps, extent: getExtent(axisProps) };

    const main = orient2channel(ap.orient);
    const secondary = getPerpendicularChannel(main);

    const offsetDirection =
        ap.orient == "bottom" || ap.orient == "right" ? 1 : -1;

    const anchor = ap.orient == "bottom" || ap.orient == "left" ? 1 : 0;

    /**
     * @return {import("../spec/view").UnitSpec}
     */
    const createDomain = () => ({
        name: "domain",
        data: { values: [0] },
        mark: {
            type: "rule",
            clip: false,
            strokeDash: ap.domainDash,
            strokeCap: ap.domainCap,
            color: ap.domainColor,
            [secondary]: anchor,
            size: ap.domainWidth,
        },
    });

    /**
     * @return {import("../spec/view").UnitSpec}
     */
    const createLabels = () => ({
        name: "labels",
        mark: {
            type: "text",
            clip: false,
            align: ap.labelAlign,
            angle: ap.labelAngle,
            baseline: ap.labelBaseline,
            [secondary + "Offset"]:
                (ap.tickSize + ap.labelPadding) * offsetDirection,
            [secondary]: anchor,
            size: ap.labelFontSize,
            color: ap.labelColor,
            minBufferSize: 1500, // to prevent GPU buffer reallocation when zooming
            dynamicData: true,
        },
        encoding: {
            [main]: { field: "value", type: "quantitative" },
            text: { field: "label" },
        },
    });

    /**
     * @return {import("../spec/view").UnitSpec}
     */
    const createTicks = () => ({
        name: "ticks",
        mark: {
            type: "rule",
            clip: false,
            strokeDash: ap.tickDash,
            strokeCap: ap.tickCap,
            color: ap.tickColor,
            size: ap.tickWidth,
            minBufferSize: 300,
            dynamicData: true,
        },
        encoding: {
            [secondary]: { value: anchor },
            [secondary + "2"]: {
                value: anchor - (ap.tickSize / ap.extent) * (anchor ? 1 : -1),
            },
        },
    });

    /**
     * @return {import("../spec/view").UnitSpec}
     */
    const createTitle = () => ({
        name: "title",
        data: { values: [0] },
        mark: {
            type: "text",
            clip: false,
            align: "center",
            baseline: ap.orient == "bottom" ? "bottom" : "top",
            angle: [0, 90, 0, -90][
                ["top", "right", "bottom", "left"].indexOf(ap.orient)
            ],
            text: ap.title,
            color: ap.titleColor,
            [main]: 0.5,
            [secondary]: 1 - anchor,
        },
    });

    /**
     * @return {import("../spec/view").LayerSpec}
     */
    const createTicksAndLabels = () => {
        /** @type {LayerSpec} */
        const spec = {
            name: "ticks_and_labels",
            encoding: {
                [main]: { field: "value", type: "quantitative" },
            },
            layer: [],
        };

        if (ap.ticks) {
            spec.layer.push(createTicks());
        }

        if (ap.labels) {
            spec.layer.push(createLabels());
        }

        return spec;
    };

    /** @type {LayerSpec} */
    const axisSpec = {
        [CHANNEL_DIMENSIONS[
            getPerpendicularChannel(orient2channel(ap.orient))
        ]]: ap.extent,
        data: { dynamicCallbackSource: true },
        layer: [],
    };

    if (ap.domain) {
        axisSpec.layer.push(createDomain());
    }

    if (ap.ticks || ap.labels) {
        axisSpec.layer.push(createTicksAndLabels());
    }

    if (ap.title) {
        axisSpec.layer.push(createTitle());
    }

    return axisSpec;
}

/** @type {import("../spec/axis").GenomeAxis} */
const defaultGenomeAxisProps = {
    ...defaultAxisProps,

    chromTicks: true,
    chromTickSize: 18,
    chromTickWidth: 1,
    chromTickColor: "#989898",
    chromTickDash: [4, 2],
    chromTickDashOffset: 1,

    chromLabels: true,
    chromLabelFontSize: 13,
    chromLabelFontWeight: "normal",
    chromLabelFontStyle: "normal",
    chromLabelColor: "black",
    chromLabelAlign: "left",
    chromLabelPadding: 7,
    // TODO: chromLabelAngle
};

/**
 * @param {GenomeAxis} axisProps
 * @returns {LayerSpec}
 */
export function createGenomeAxis(axisProps) {
    const ap = { ...axisProps, extent: getExtent(axisProps) };

    const main = orient2channel(ap.orient);
    const secondary = getPerpendicularChannel(main);

    const anchor = ap.orient == "bottom" || ap.orient == "left" ? 1 : 0;

    /**
     * @return {import("../spec/view").UnitSpec}
     */
    const createChromosomeTicks = () => ({
        name: "chromosome_ticks",
        mark: {
            type: "rule",
            strokeDash: axisProps.chromTickDash,
            strokeDashOffset: axisProps.chromTickDashOffset,
            [secondary]: anchor,
            [secondary + "2"]:
                anchor - (ap.chromTickSize / ap.extent) * (anchor ? 1 : -1),
            color: axisProps.chromTickColor,
            size: ap.chromTickWidth,
            dynamicData: true,
        },
    });

    /**
     * @return {import("../spec/view").UnitSpec}
     */
    const createChromosomeLabels = () => {
        /** @type {Partial<import("../spec/mark").MarkConfig>} */
        let chromLabelMarkProps;
        switch (ap.orient) {
            case "top":
                chromLabelMarkProps = {
                    y: 0,
                    angle: 0,
                    paddingX: 4,
                    dy: -ap.chromLabelPadding,
                    viewportEdgeFadeWidthLeft: 20,
                    viewportEdgeFadeWidthRight: 20,
                    viewportEdgeFadeDistanceRight: -10,
                    viewportEdgeFadeDistanceLeft: -20,
                };
                break;
            case "bottom":
                chromLabelMarkProps = {
                    y: 1,
                    angle: 0,
                    paddingX: 4,
                    dy: ap.chromLabelPadding + ap.chromLabelFontSize * 0.73, // A hack to align baseline with other labels
                    viewportEdgeFadeWidthLeft: 20,
                    viewportEdgeFadeWidthRight: 20,
                    viewportEdgeFadeDistanceRight: -10,
                    viewportEdgeFadeDistanceLeft: -20,
                };
                break;
            case "left":
                chromLabelMarkProps = {
                    x: 1,
                    angle: -90,
                    paddingY: 4,
                    dy: -ap.chromLabelPadding,
                    viewportEdgeFadeWidthBottom: 20,
                    viewportEdgeFadeWidthTop: 20,
                    viewportEdgeFadeDistanceBottom: -20,
                    viewportEdgeFadeDistanceTop: -10,
                };
                break;
            case "right":
                chromLabelMarkProps = {
                    x: 0,
                    angle: 90,
                    align: "right",
                    paddingY: 4,
                    dy: -ap.chromLabelPadding,
                };
                break;
            default:
                chromLabelMarkProps = {};
        }

        /** @type {import("../spec/view").UnitSpec} */
        const labels = {
            name: "chromosome_labels",
            mark: {
                type: "text",
                size: ap.chromLabelFontSize,
                font: ap.chromLabelFont,
                fontWeight: ap.chromLabelFontWeight,
                fontStyle: ap.chromLabelFontStyle,
                color: ap.chromLabelColor,
                align: axisProps.chromLabelAlign,
                baseline: "alphabetic",
                clip: false,
                dynamicData: true,
                ...chromLabelMarkProps,
            },
            encoding: {
                [main + "2"]: { field: "continuousEnd", type: "locus" },
                text: { field: "name" },
            },
        };
        return labels;
    };

    /** @type {Axis} */
    let fixedAxisProps;
    switch (ap.orient) {
        case "bottom":
        case "top":
            fixedAxisProps = {};
            break;
        case "left":
            fixedAxisProps = {
                labelAngle: -90,
                labelAlign: "center",
                labelPadding: 6,
            };
            break;
        case "right":
            fixedAxisProps = {
                labelAngle: 90,
                labelAlign: "center",
                labelPadding: 6,
            };
            break;
        default:
            fixedAxisProps = {};
    }

    // Create an ordinary axis
    const axisSpec = createAxis({
        ...axisProps,
        ...fixedAxisProps,
        // TODO: Allow the user to override fixedAxisProps
    });

    if (axisProps.chromTicks || axisProps.chromLabels) {
        /** @type {import("../spec/view").LayerSpec} */
        const chromLayerSpec = {
            // TODO: Configuration
            name: CHROM_LAYER_NAME,
            data: { dynamicCallbackSource: true },
            encoding: {
                // TODO: { chrom: "name", type: "locus" } // without pos = pos is 0
                [main]: { field: "continuousStart", type: "locus", band: 0 },
            },
            layer: [],
        };

        if (axisProps.chromTicks) {
            chromLayerSpec.layer.push(createChromosomeTicks());
        }

        if (axisProps.chromLabels) {
            chromLayerSpec.layer.push(createChromosomeLabels());

            /** @type {import("../spec/mark").MarkConfig} */
            let labelMarkSpec;

            // TODO: Simplify the following mess
            axisSpec.layer
                .filter((view) => view.name == "ticks_and_labels")
                .forEach((/** @type {LayerSpec} */ view) =>
                    view.layer
                        .filter((view) => view.name == "labels")
                        .forEach(
                            (
                                /** @type {import("../spec/view").UnitSpec} */ view
                            ) => {
                                labelMarkSpec =
                                    /** @type {import("../spec/mark").MarkConfig} */ (
                                        view.mark
                                    );
                            }
                        )
                );

            if (labelMarkSpec) {
                if (ap.orient == "top" || ap.orient == "bottom") {
                    labelMarkSpec.viewportEdgeFadeWidthLeft = 30;
                    labelMarkSpec.viewportEdgeFadeDistanceLeft = 40;
                } else {
                    labelMarkSpec.viewportEdgeFadeWidthBottom = 30;
                    labelMarkSpec.viewportEdgeFadeDistanceBottom = 40;
                }
            }
        }

        axisSpec.layer.push(chromLayerSpec);
    }

    return axisSpec;
}
