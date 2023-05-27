import LayerView from "./layerView";
import { FlexDimensions } from "../utils/layout/flexLayout";

const CHROM_LAYER_NAME = "chromosome_ticks_and_labels";

/** @type {Record<import("../spec/channel").PrimaryPositionalChannel, import("../spec/view").GeometricDimension>} */
const CHANNEL_DIMENSIONS = {
    x: "width",
    y: "height",
};

/**
 * @param {import("../spec/channel").PrimaryPositionalChannel} channel
 * @returns {import("../spec/channel").PrimaryPositionalChannel}
 */
function getPerpendicularChannel(channel) {
    return channel == "x" ? "y" : "x";
}

/**
 * @type {Record<import("../spec/channel").PrimaryPositionalChannel, AxisOrient[]>}
 */
export const CHANNEL_ORIENTS = {
    x: ["bottom", "top"],
    y: ["left", "right"],
};

/**
 * @type {Record<AxisOrient, import("../spec/channel").PrimaryPositionalChannel>}
 */
const ORIENT_CHANNELS = Object.fromEntries(
    Object.entries(CHANNEL_ORIENTS)
        .map(([channel, slots]) => slots.map((slot) => [slot, channel]))
        .flat(1)
);

/**
 * @param {AxisOrient} slot
 */
export function orient2channel(slot) {
    return ORIENT_CHANNELS[slot];
}

/**
 * An internal view that renders an axis.
 *
 * TODO: Implement grid
 *
 */
export default class AxisView extends LayerView {
    /**
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

    /**
     * @param {Axis} axisProps
     * @param {import("../types/viewContext").default} context
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
                ? createGenomeAxis(fullAxisProps, type)
                : createAxis(fullAxisProps, type),
            context,
            parent,
            `axis_${axisProps.orient}`
        );

        this.axisProps = fullAxisProps;
        this.blockEncodingInheritance = true;
        this.contributesToScaleDomain = false;
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
 * @param {string} type
 * @returns {LayerSpec}
 */
function createAxis(axisProps, type) {
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
        },
        encoding: {
            [main]: { field: "value", type },
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
                [main]: { field: "value", type },
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
        // Force the resolution towards the parent view even if it has "independent" behavior
        resolve: { scale: { [main]: "forced" } },
        [CHANNEL_DIMENSIONS[getPerpendicularChannel(main)]]: ap.extent,
        data: {
            lazy: {
                type: "axisTicks",
                channel: main,
                axis: axisProps,
            },
        },
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
 * @param {string} type
 * @returns {LayerSpec}
 */
export function createGenomeAxis(axisProps, type) {
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
                ...chromLabelMarkProps,
            },
            encoding: {
                [main + "2"]: { field: "continuousEnd", type },
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
    const axisSpec = createAxis(
        {
            ...axisProps,
            ...fixedAxisProps,
            // TODO: Allow the user to override fixedAxisProps
        },
        type
    );

    if (axisProps.chromTicks || axisProps.chromLabels) {
        /** @type {import("../spec/view").LayerSpec} */
        const chromLayerSpec = {
            // TODO: Configuration
            name: CHROM_LAYER_NAME,
            data: {
                lazy: {
                    type: "axisGenome",
                    channel: orient2channel(ap.orient),
                },
            },
            encoding: {
                // TODO: { chrom: "name", type: "locus" } // without pos = pos is 0
                [main]: { field: "continuousStart", type, band: 0 },
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
