import LayerView from "./layerView.js";
import { FlexDimensions } from "./layout/flexLayout.js";
import UnitView from "./unitView.js";
import { markViewAsNonAddressable } from "./viewSelectors.js";
import { getConfiguredAxisDefaults } from "../config/axisConfig.js";

const CHROM_LAYER_NAME = "chromosome_ticks_and_labels";
const LABELS_LAYER_NAME = "labels_main";
const TICKS_AND_LABELS_LAYER_NAME = "ticks_and_labels";
const AXIS_EXTENT_PARAM = "axisExtent";
const LABEL_WIDTH_FIELD = "_labelWidth";
const Y_AXIS_LABEL_HEURISTIC_PX = 10;
const AUTO_EXTENT_GROW_THRESHOLD_PX = 10;

/** @type {Record<import("../spec/channel.js").PrimaryPositionalChannel, import("../spec/view.js").GeometricDimension>} */
const CHANNEL_DIMENSIONS = {
    x: "width",
    y: "height",
};

/**
 * @param {import("../spec/channel.js").PrimaryPositionalChannel} channel
 * @returns {import("../spec/channel.js").PrimaryPositionalChannel}
 */
function getPerpendicularChannel(channel) {
    return channel == "x" ? "y" : "x";
}

/**
 * @type {Record<import("../spec/channel.js").PrimaryPositionalChannel, AxisOrient[]>}
 */
export const CHANNEL_ORIENTS = {
    x: ["bottom", "top"],
    y: ["left", "right"],
};

/**
 * @type {Record<AxisOrient, import("../spec/channel.js").PrimaryPositionalChannel>}
 */
export const ORIENT_CHANNELS = Object.fromEntries(
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
    #effectiveExtent;

    #axisExtentSetter;

    /** @type {UnitView | undefined} */
    #labelsView;

    #measurementScheduled = false;

    /**
     *
     * @typedef {import("../spec/view.js").LayerSpec} LayerSpec
     * @typedef {import("./view.js").default} View
     * @typedef {import("../spec/axis.js").Axis} Axis
     * @typedef {import("../spec/axis.js").GenomeAxis} GenomeAxis
     * @typedef {import("../spec/axis.js").AxisOrient} AxisOrient
     * @typedef {import("./layout/flexLayout.js").SizeDef} SizeDef
     *
     * @typedef {Axis & { extent: number }} AugmentedAxis
     */

    /**
     * @param {Axis} axisProps
     * @param {import("../types/viewContext.js").default} context
     * @param {string} type Data type (quantitative, ..., locus)
     * @param {import("./containerView.js").default} layoutParent
     * @param {import("./view.js").default} dataParent
     * @param {import("./view.js").ViewOptions} [options]
     */
    constructor(axisProps, type, context, layoutParent, dataParent, options) {
        const channel = orient2channel(axisProps.orient);
        const configuredDefaults = getConfiguredAxisDefaults(
            dataParent.getConfigScopes(),
            {
                channel,
                orient: axisProps.orient,
                type: /** @type {import("../spec/channel.js").Type} */ (type),
                style: axisProps.style,
            }
        );

        /** @type {Axis} */
        const preliminaryAxisProps = {
            ...configuredDefaults,
            ...axisProps,
        };

        /** @type {Axis | GenomeAxis} */
        const fullAxisProps = {
            ...configuredDefaults,
            ...getDefaultAngleAndAlign(type, preliminaryAxisProps),
            ...axisProps,
        };

        // Now the presence of genomeAxis is based on field type, not scale type.
        // TODO: Use scale instead. However, it would make the initialization much more
        // complex because scales are not available before scale resolution.
        const genomeAxis = type == "locus";

        super(
            genomeAxis
                ? createGenomeAxis(fullAxisProps, type)
                : createAxis(fullAxisProps, type),
            context,
            layoutParent,
            dataParent,
            `axis_${axisProps.orient}`,
            {
                blockEncodingInheritance: true,
                ...options,
            }
        );

        this.axisProps = fullAxisProps;
        this.#effectiveExtent = getExtent(fullAxisProps);
        this.#axisExtentSetter = this.paramRuntime.allocateSetter(
            AXIS_EXTENT_PARAM,
            this.#effectiveExtent
        );

        markViewAsNonAddressable(this, { skipSubtree: true });
    }

    async initializeChildren() {
        await super.initializeChildren();

        const labelsView = this.getDescendants().find(
            (view) =>
                view instanceof UnitView && view.name === LABELS_LAYER_NAME
        );
        if (labelsView instanceof UnitView) {
            this.#labelsView = labelsView;
        }

        if (!this.axisProps.labels || !this.#labelsView) {
            return;
        }

        const scaleResolution = this.dataParent.getScaleResolution(
            orient2channel(this.axisProps.orient)
        );
        if (scaleResolution) {
            const listener = () => this.#scheduleAutoExtentMeasurement();
            scaleResolution.addEventListener("domain", listener);
            this.registerDisposer(() =>
                scaleResolution.removeEventListener("domain", listener)
            );
        }

        this.registerDisposer(
            this._addBroadcastHandler("layoutComputed", () =>
                this.#scheduleAutoExtentMeasurement()
            )
        );
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
        return this.#effectiveExtent;
    }

    isPickingSupported() {
        return false;
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

    #updateAutoExtent() {
        const measuredLabelExtent = getMeasuredLabelExtent(
            this.axisProps,
            this.context,
            this.#labelsView
        );
        if (measuredLabelExtent === undefined) {
            return;
        }

        const nextExtent = getExtent(this.axisProps, measuredLabelExtent);
        if (
            nextExtent <
            this.#effectiveExtent + AUTO_EXTENT_GROW_THRESHOLD_PX
        ) {
            return;
        }

        this.#effectiveExtent = nextExtent;
        this.#axisExtentSetter(nextExtent);
        this.invalidateSizeCache();
        this.context.requestLayoutReflow();
    }
}

/**
 * @param {Axis} axisProps
 * @param {number} [measuredLabelExtent]
 */
function getExtent(axisProps, measuredLabelExtent) {
    /** @type {number} */
    let extent = getFixedAxisExtent(axisProps);

    if (axisProps.labels) {
        extent += measuredLabelExtent ?? getHeuristicLabelExtent(axisProps);
    }

    // TODO: Include chrom ticks and labels!

    return clampAxisExtent(axisProps, extent);
}

/**
 * @param {Axis} axisProps
 */
function getFixedAxisExtent(axisProps) {
    let extent = (axisProps.ticks && axisProps.tickSize) || 0;

    if (axisProps.labels) {
        extent += axisProps.labelPadding;
    }

    if (axisProps.title) {
        extent += axisProps.titlePadding + axisProps.titleFontSize;
    }

    return extent;
}

/**
 * @param {Axis} axisProps
 */
function getHeuristicLabelExtent(axisProps) {
    return orient2channel(axisProps.orient) == "x"
        ? axisProps.labelFontSize
        : Y_AXIS_LABEL_HEURISTIC_PX;
}

/**
 * @param {Axis} axisProps
 * @param {number} extent
 */
function clampAxisExtent(axisProps, extent) {
    return Math.min(
        axisProps.maxExtent || Infinity,
        Math.max(axisProps.minExtent || 0, extent)
    );
}

/**
 * @param {Axis} axisProps
 * @param {import("../types/viewContext.js").default} context
 * @param {UnitView | undefined} labelsView
 */
function getMeasuredLabelExtent(axisProps, context, labelsView) {
    const collector = labelsView?.getCollector();
    if (!collector?.completed) {
        return undefined;
    }

    let maxWidth = 0;
    collector.visitData((datum) => {
        maxWidth = Math.max(maxWidth, Number(datum[LABEL_WIDTH_FIELD]) || 0);
    });

    const font = axisProps.labelFont
        ? context.fontManager.getFont(
              axisProps.labelFont,
              /** @type {import("../spec/font.js").FontStyle | undefined} */ (
                  axisProps.labelFontStyle
              ),
              /** @type {import("../spec/font.js").FontWeight | undefined} */ (
                  axisProps.labelFontWeight
              )
          )
        : context.fontManager.getDefaultFont();
    const metrics = font.metrics;
    if (!metrics) {
        return undefined;
    }

    const labelHeight =
        ((metrics.capHeight + metrics.descent) / metrics.common.base) *
        axisProps.labelFontSize;

    const radians = (axisProps.labelAngle * Math.PI) / 180;
    const absSin = Math.abs(Math.sin(radians));
    const absCos = Math.abs(Math.cos(radians));

    const perpendicularExtent =
        orient2channel(axisProps.orient) == "x"
            ? maxWidth * absSin + labelHeight * absCos
            : maxWidth * absCos + labelHeight * absSin;

    return Math.ceil(perpendicularExtent);
}

/**
 * @param {string} type
 * @param {Axis} axisProps
 */
function getDefaultAngleAndAlign(type, axisProps) {
    const orient = axisProps.orient;
    const discrete = type == "nominal" || type == "ordinal";

    /** @type {import("../spec/font.js").Align} */
    let align = "center";
    /** @type {import("../spec/font.js").Baseline} */
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

    const makeMainDomainDef = () => ({
        field: "value",
        type,
    });

    /**
     * @return {import("../spec/view.js").UnitSpec}
     */
    const createDomain = () => ({
        name: "domain",
        data: { values: [{}] },
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
     * @return {import("../spec/view.js").UnitSpec}
     */
    const createLabels = () => ({
        name: LABELS_LAYER_NAME,
        transform: [
            {
                type: "measureText",
                field: "label",
                as: LABEL_WIDTH_FIELD,
                fontSize: ap.labelFontSize,
                font: ap.labelFont,
                fontStyle:
                    /** @type {import("../spec/font.js").FontStyle | undefined} */ (
                        ap.labelFontStyle
                    ),
                fontWeight:
                    /** @type {import("../spec/font.js").FontWeight | undefined} */ (
                        ap.labelFontWeight
                    ),
            },
        ],
        mark: {
            type: "text",
            clip: false,
            align: ap.labelAlign,
            angle: ap.labelAngle,
            baseline: ap.labelBaseline,
            font: ap.labelFont,
            fontStyle:
                /** @type {import("../spec/font.js").FontStyle | undefined} */ (
                    ap.labelFontStyle
                ),
            fontWeight:
                /** @type {import("../spec/font.js").FontWeight | undefined} */ (
                    ap.labelFontWeight
                ),
            [secondary + "Offset"]:
                (ap.tickSize + ap.labelPadding) * offsetDirection,
            [secondary]: anchor,
            size: ap.labelFontSize,
            color: ap.labelColor,
            minBufferSize: 1500, // to prevent GPU buffer reallocation when zooming
        },
        encoding: {
            [main]: makeMainDomainDef(),
            text: { field: "label" },
        },
    });

    /**
     * @return {import("../spec/view.js").UnitSpec}
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
                value: {
                    expr: `${anchor} - ${ap.tickSize} / ${AXIS_EXTENT_PARAM} * ${
                        anchor ? 1 : -1
                    }`,
                },
            },
        },
    });

    /**
     * @return {import("../spec/view.js").UnitSpec}
     */
    const createTitle = () => ({
        name: "title",
        data: { values: [{}] },
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
     * @return {import("../spec/view.js").LayerSpec}
     */
    const createTicksAndLabels = () => {
        /** @type {LayerSpec} */
        const spec = {
            name: TICKS_AND_LABELS_LAYER_NAME,
            encoding: {
                [main]: makeMainDomainDef(),
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
        domainInert: true,
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
     * @return {import("../spec/view.js").UnitSpec}
     */
    const createChromosomeTicks = () => ({
        name: "chromosome_ticks",
        mark: {
            type: "rule",
            strokeDash: axisProps.chromTickDash,
            strokeDashOffset: axisProps.chromTickDashOffset,
            [secondary]: anchor,
            [secondary + "2"]: {
                value: {
                    expr: `${anchor} - ${ap.chromTickSize} / ${AXIS_EXTENT_PARAM} * ${
                        anchor ? 1 : -1
                    }`,
                },
            },
            color: axisProps.chromTickColor,
            size: ap.chromTickWidth,
        },
    });

    /**
     * @return {import("../spec/view.js").UnitSpec}
     */
    const createChromosomeLabels = () => {
        /** @type {Partial<import("../spec/mark.js").TextProps>} */
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

        /** @type {import("../spec/view.js").UnitSpec} */
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
                [main + "2"]: {
                    field: "continuousEnd",
                    type,
                },
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
        /** @type {import("../spec/view.js").LayerSpec} */
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
                [main]: {
                    field: "continuousStart",
                    type,
                    band: 0,
                },
            },
            layer: [],
        };

        if (axisProps.chromTicks) {
            chromLayerSpec.layer.push(createChromosomeTicks());
        }

        if (axisProps.chromLabels) {
            chromLayerSpec.layer.push(createChromosomeLabels());

            /** @type {import("../spec/mark.js").TextProps} */
            let labelMarkSpec;

            // TODO: Simplify the following mess
            axisSpec.layer
                .filter((view) => view.name == TICKS_AND_LABELS_LAYER_NAME)
                .forEach((/** @type {LayerSpec} */ view) =>
                    view.layer
                        .filter((view) => view.name == LABELS_LAYER_NAME)
                        .forEach(
                            (
                                /** @type {import("../spec/view.js").UnitSpec} */ view
                            ) => {
                                labelMarkSpec =
                                    /** @type {import("../spec/mark.js").TextProps} */ (
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
