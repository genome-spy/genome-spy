import { validTicks, tickValues, tickFormat, tickCount } from "../scale/ticks";
import ContainerView from "./containerView";
import { getFlattenedViews } from "./viewUtils";
import LayerView from "./layerView";
import Padding from "../utils/layout/padding";
import { isNumber, zoomLinear, inrange } from "vega-util";
import { shallowArrayEquals } from "../utils/arrayUtils";
import smoothstep from "../utils/smoothstep";

/**
 * TODO: Move these somewhere for common use
 * @typedef {import("../spec/view").PositionalChannel} PositionalChannel
 * @typedef {import("../spec/view").GeometricDimension} GeometricDimension
 */

const CHROM_LAYER_NAME = "chromosome_ticks_and_labels";

/** @type {Record<PositionalChannel, AxisOrient[]>} */
const CHANNEL_SLOTS = {
    x: ["bottom", "top"],
    y: ["left", "right"]
};

/** @type {Record<PositionalChannel, GeometricDimension>} */
const CHANNEL_DIMENSIONS = {
    x: "width",
    y: "height"
};

/**
 * @param {PositionalChannel} channel
 * @returns {PositionalChannel}
 */
function getPerpendicularChannel(channel) {
    return channel == "x" ? "y" : "x";
}

/**
 * @param {AxisOrient} slot
 */
function slot2channel(slot) {
    for (const [channel, slots] of Object.entries(CHANNEL_SLOTS)) {
        if (slots.includes(slot)) {
            return /** @type {PositionalChannel} */ (channel);
        }
    }
    throw new Error("Invalid slot: " + slot);
}

/**
 * @param {AxisOrient} slot
 */
function slot2dimension(slot) {
    return CHANNEL_DIMENSIONS[slot2channel(slot)];
}

/**
 * An internal view that wraps a unit or layer view and takes care of the axes.
 *
 * @typedef {import("../spec/view").LayerSpec} LayerSpec
 * @typedef {import("./view").default} View
 * @typedef {import("../spec/axis").Axis} Axis
 * @typedef {import("../spec/axis").GenomeAxis} GenomeAxis
 * @typedef {import("../spec/axis").AxisOrient} AxisOrient
 *
 * @typedef {Axis & { extent: number }} AugmentedAxis
 */
export default class AxisWrapperView extends ContainerView {
    /**
     * @param {import("./viewUtils").ViewContext} context
     * @param {import("./containerView").default} parent
     */
    constructor(context, parent) {
        super({}, context, parent, "axiswrapper");

        /** @type { import("./layerView").default | import("./unitView").default } */
        this.child = undefined;

        /** @type {Record<AxisOrient, import("./layerView").default>} */
        this.axisViews = {
            top: undefined,
            right: undefined,
            bottom: undefined,
            left: undefined
        };

        /** @type {Record<AxisOrient, Axis>} */
        this.axisProps = {
            top: undefined,
            right: undefined,
            bottom: undefined,
            left: undefined
        };

        this._addBroadcastHandler("zoom", message => {
            const zoomEvent =
                /** @type {import("../utils/zoom").ZoomEvent} */ (message.payload);

            if (
                this.getCoords().containsPoint(
                    zoomEvent.mouseX,
                    zoomEvent.mouseY
                )
            ) {
                this._handleZoom(zoomEvent);
            }
        });

        this._addBroadcastHandler("layout", () => this._updateAxisData());
    }

    /**
     * Creates the axis views
     *
     * TODO: Perhaps views need a common initialization method?
     */
    initialize() {
        Object.entries(CHANNEL_SLOTS).forEach(([channel, slots]) =>
            this._initializeAxes(channel, slots)
        );
    }

    /**
     * @param {View} [whoIsAsking] Passed to the immediate parent. Allows for
     *      selectively breaking the inheritance.
     */
    getEncoding(whoIsAsking) {
        if (Object.values(this.axisViews).find(view => whoIsAsking === view)) {
            // Prevent the axis views from inheriting any encodings
            return {};
        }

        return super.getEncoding();
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        yield this.child;
        for (const view of Object.values(this.axisViews)) {
            if (view) {
                yield view;
            }
        }
    }

    _updateAxisData() {
        for (const [slot, view] of Object.entries(this.axisViews)) {
            if (view) {
                const channel = slot2channel(/** @type {AxisOrient} */ (slot));
                const scale = this.getResolution(channel).getScale();
                const oldTicks = (view.data && [...view.data.flatData()]) || [];
                const newTicks = generateTicks(
                    this.axisProps[slot],
                    scale,
                    this.getChildCoords(view)[CHANNEL_DIMENSIONS[channel]],
                    oldTicks
                );

                if (newTicks !== oldTicks) {
                    view.updateData(newTicks);
                }

                if (scale.type == "locus") {
                    const chromLayer = view.findChildByName(CHROM_LAYER_NAME);
                    const chromMapper = /** @type {import("../genome/scaleLocus").default} */ (scale).chromMapper();
                    if (chromLayer && chromMapper) {
                        if (![...chromLayer.getData().flatData()].length) {
                            chromLayer.updateData(chromMapper.chromosomes);
                        }
                    }
                }
            }
        }
    }

    /**
     * @param {AxisOrient} slot
     */
    _getAxisSize(slot) {
        const dimension =
            CHANNEL_DIMENSIONS[getPerpendicularChannel(slot2channel(slot))];
        return this.axisViews[slot]
            ? this.axisViews[slot].getSize()[dimension].px
            : 0;
    }

    getAxisExtents() {
        /** @type {Record<AxisOrient, number>} */
        // @ts-ignore
        const paddings = {};
        for (const slot of /** @type {AxisOrient[]} */ (Object.keys(
            this.axisViews
        ))) {
            paddings[slot] = this._getAxisSize(slot);
        }
        return Padding.createFromRecord(paddings);
    }

    getSize() {
        const size = super.getSize();
        const padding = this.getAxisExtents();
        size.width.px = (size.width.px || 0) + padding.width;
        size.height.px = (size.height.px || 0) + padding.height;
        return size;
    }

    /**
     * @param { import("./layerView").default | import("./unitView").default} view
     */
    getChildCoords(view) {
        const extents = this.getAxisExtents();

        if (view === this.child) {
            return this.getCoords().shrink(extents);
        } else {
            let childCoords = this.child.getCoords();
            if (view === this.axisViews.bottom) {
                childCoords = childCoords
                    .translate(0, childCoords.height)
                    .modify({ height: extents.bottom });
            } else if (view === this.axisViews.top) {
                childCoords = childCoords
                    .translate(0, -extents.top)
                    .modify({ height: extents.top });
            } else if (view === this.axisViews.left) {
                childCoords = childCoords
                    .translate(-extents.left, 0)
                    .modify({ width: extents.left });
            } else if (view === this.axisViews.right) {
                childCoords = childCoords
                    .translate(childCoords.width, 0)
                    .modify({ width: extents.right });
            } else {
                throw new Error("Not my child view!");
            }

            // Align domain lines to center of pixels. TODO: Configurable
            childCoords = childCoords.translate(0.5, 0.5);

            return childCoords;
        }
    }

    /**
     * Returns the views that should be scanned for resolutions: all view's ancestors and children.
     * Axis views are not included.
     */
    _getResolutionParticipants() {
        return [...this.getAncestors(), ...getFlattenedViews(this.child)];
    }

    /**
     * @param {string} channel
     * @param {AxisOrient[]} slots
     */
    _initializeAxes(channel, slots) {
        const resolutions = this._getResolutionParticipants()
            .map(view => view.resolutions[channel])
            .filter(resolution => resolution);

        // First, fill the preferred slots
        for (const r of resolutions) {
            const axisProps = r.getAxisProps();
            if (axisProps && axisProps.orient) {
                if (!slots.includes(axisProps.orient)) {
                    throw new Error(
                        `Invalid axis orientation for '${channel}' channel: ${axisProps.orient}`
                    );
                }
                if (this.axisViews[axisProps.orient]) {
                    throw new Error(
                        `The slot for ${axisProps.orient} axis is already reserved!`
                    );
                }
                this.axisViews[axisProps.orient] = this._createAxisView(
                    {
                        ...axisProps,
                        title: r.getTitle()
                    },
                    r.type
                );
            }
        }

        // Next, fill the slots in the preferred order
        // eslint-disable-next-line no-labels
        resolutionLoop: for (const r of resolutions) {
            const axisProps = r.getAxisProps();
            if (axisProps && !axisProps.orient) {
                for (const slot of slots) {
                    if (!this.axisViews[slot]) {
                        axisProps.orient = /** @type {AxisOrient} */ (slot);
                        this.axisViews[slot] = this._createAxisView(
                            {
                                ...axisProps,
                                title: r.getTitle()
                            },
                            r.type
                        );
                        // eslint-disable-next-line no-labels
                        continue resolutionLoop;
                    }
                }
                throw new Error(
                    "No room for axes. All slots are already reserved."
                );
            }
        }
    }

    /**
     * @param {Axis} axisProps
     * @param {string} type Data type (quantitative, ..., locus)
     */
    _createAxisView(axisProps, type) {
        const genomeAxis = type == "locus";

        // TODO: Compute extent
        const fullAxisProps = {
            ...(genomeAxis ? defaultGenomeAxisProps : defaultAxisProps),
            ...axisProps
        };

        // Stored for tick generator
        this.axisProps[axisProps.orient] = fullAxisProps;

        return new LayerView(
            genomeAxis
                ? createGenomeAxis(fullAxisProps)
                : createAxis(fullAxisProps),
            this.context,
            this,
            `axis_${axisProps.orient}`
        );
    }

    /**
     *
     * @param {import("../utils/zoom").ZoomEvent} zoomEvent
     */
    _handleZoom(zoomEvent) {
        /** @type {Record<string, Set<import("./resolution").default>>} */
        const resolutions = {
            x: new Set(),
            y: new Set()
        };

        // Find all resolutions (scales) that are candidates for zooming
        this.child.visit(v => {
            for (const [channel, resolutionSet] of Object.entries(
                resolutions
            )) {
                const resolution = v.getResolution(channel);
                if (resolution && resolution.isZoomable()) {
                    resolutionSet.add(resolution);
                }
            }
        });

        /** @type {Set<AxisWrapperView>}} Views that may require axis updates */
        const affectedViews = new Set();

        for (const [channel, resolutionSet] of Object.entries(resolutions)) {
            if (resolutionSet.size <= 0) {
                continue;
            }

            const coords = this.getChildCoords(this.child);
            const p = coords.normalizePoint(zoomEvent.mouseX, zoomEvent.mouseY);
            const tp = coords.normalizePoint(
                zoomEvent.mouseX + zoomEvent.deltaX,
                zoomEvent.mouseY + zoomEvent.deltaY
            );

            const delta = {
                x: tp.x - p.x,
                y: tp.y - p.y
            };

            for (const resolution of resolutionSet) {
                resolution.zoom(
                    2 ** (-zoomEvent.deltaY / 200),
                    channel == "y"
                        ? 1 - p[/** @type {"x"|"y"} */ (channel)]
                        : p[/** @type {"x"|"y"} */ (channel)],
                    channel == "x" ? delta.x : 0
                );

                resolution.views.forEach(view =>
                    affectedViews.add(findClosestAxisWrapper(view))
                );
            }
        }

        affectedViews.forEach(view => view._updateAxisData());

        this.context.genomeSpy.renderAll(); // TODO: context.requestRender() or something

        /** @param {View} view */
        function findClosestAxisWrapper(view) {
            do {
                if (view instanceof AxisWrapperView) {
                    return view;
                }
                view = view.parent;
            } while (view);

            throw new Error("Bug: cannot find AxisWrapperView");
        }
    }
}

/**
 * @param {Axis} axisProps
 */
function getExtent(axisProps) {
    const mainChannel = slot2channel(axisProps.orient);

    /** @type {number} */
    let extent = ((axisProps.ticks && axisProps.tickSize) || 0);

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
    const tickSpacing = length => 25 + 60 * smoothstep(100, 700, length);

    let count = isNumber(axisProps.tickCount)
        ? axisProps.tickCount
        : Math.round(axisLength / tickSpacing(axisLength));

    count = tickCount(scale, count, axisProps.tickMinStep);

    const values = axisProps.values
        ? validTicks(scale, axisProps.values, count)
        : tickValues(scale, count).filter(x =>
              // TODO: Fix locus scale
              inrange(scale(x), [0, 1], true, true)
          );

    if (
        shallowArrayEquals(
            values,
            oldTicks,
            v => v,
            d => d.value
        )
    ) {
        return oldTicks;
    } else {
        const format = tickFormat(scale, count, axisProps.format);

        return values.map(x => ({ value: x, label: format(x) }));
    }
}

// Based on: https://vega.github.io/vega-lite/docs/axis.html
/** @type {Axis} */
const defaultAxisProps = {
    /** @type {number[] | string[] | boolean[]} */
    values: null,

    minExtent: 30,
    maxExtent: Infinity,
    offset: 0, // TODO: Implement

    domain: true,
    domainWidth: 1,
    domainColor: "gray",
    /** @type {number[]} */
    domainDash: null,
    domainDashOffset: 0,

    ticks: true,
    tickSize: 6,
    tickWidth: 1,
    tickColor: "gray",
    /** @type {number[]} */
    tickDash: null,

    // TODO: tickBand

    /** @type {number} */
    tickCount: null,
    /** @type {number} */
    tickMinStep: null,

    labels: true,
    labelPadding: 4,
    labelFontSize: 10,
    labelLimit: 180, // TODO
    labelColor: "black",
    /** @type { string } */
    format: null,

    titleColor: "black",
    titleFont: "sans-serif",
    titleFontSize: 10,
    titlePadding: 3

    // TODO: titleX, titleY, titleAngle, titleAlign, etc
};

/**
 * @param {Axis} axisProps
 * @returns {LayerSpec}
 */
export function createAxis(axisProps) {
    // TODO: Ensure that no channels except the positional ones are shared

    const ap = { ...axisProps, extent: getExtent(axisProps) };

    const main = slot2channel(ap.orient);
    const secondary = getPerpendicularChannel(main);

    const offsetDirection =
        ap.orient == "bottom" || ap.orient == "right" ? 1 : -1;

    const anchor = ap.orient == "bottom" || ap.orient == "left" ? 1 : 0;

    const createDomain = () => ({
        name: "domain",
        data: { values: [0] },
        mark: {
            type: "rule",
            clip: false,
            strokeDash: ap.domainDash
        },
        encoding: {
            color: { value: ap.domainColor },
            [secondary]: { value: anchor },
            size: { value: ap.domainWidth }
        }
    });

    const createLabels = () => ({
        name: "labels",
        mark: {
            type: "text",
            clip: false,
            align:
                main == "x" ? "center" : ap.orient == "left" ? "right" : "left",
            baseline:
                main == "y"
                    ? "middle"
                    : ap.orient == "bottom"
                    ? "top"
                    : "alphabetic",
            ["d" + secondary]:
                (ap.tickSize + ap.labelPadding) * offsetDirection,
            minBufferSize: 1500
        },
        encoding: {
            [main]: { field: "value", type: "quantitative" },
            text: { field: "label", type: "quantitative" },
            [secondary]: { value: anchor },
            size: { value: ap.labelFontSize },
            color: { value: ap.labelColor }
        }
    });

    const createTicks = () => ({
        name: "ticks",
        mark: {
            type: "rule",
            clip: false,
            strokeDash: ap.tickDash,
            minBufferSize: 300
        },
        encoding: {
            [secondary]: { value: anchor },
            [secondary + "2"]: {
                value: anchor - (ap.tickSize / ap.extent) * (anchor ? 1 : -1)
            },
            color: { value: ap.tickColor },
            size: { value: ap.tickWidth }
        }
    });

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
            ]
        },
        encoding: {
            text: { value: ap.title },
            color: { value: ap.titleColor },
            [main]: { value: 0.5 },
            [secondary]: { value: 1 - anchor }
        }
    });

    const createTicksAndLabels = () => {
        /** @type {LayerSpec} */
        const spec = {
            name: "ticks_and_labels",
            encoding: {
                [main]: { field: "value", type: "quantitative" }
            },
            layer: []
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
        [CHANNEL_DIMENSIONS[getPerpendicularChannel(slot2channel(ap.orient))]]:
            ap.extent,
        data: { values: [] },
        layer: []
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
    chromTickSize: 19,
    chromTickWidth: 1,
    chromTickColor: "#989898",
    chromTickDash: [4, 2],
    chromTickDashOffset: 1,

    chromLabels: true,
    chromLabelFontSize: 13,
    chromLabelFontWeight: "normal",
    chromLabelColor: "black",
    chromLabelAlign: "left",
    chromLabelPadding: 7
};

/**
 * @param {GenomeAxis} axisProps
 * @returns {LayerSpec}
 */
export function createGenomeAxis(axisProps) {
    const ap = { ...axisProps, extent: getExtent(axisProps) };

    const main = slot2channel(ap.orient);
    const secondary = getPerpendicularChannel(main);

    const offsetDirection =
        ap.orient == "bottom" || ap.orient == "right" ? 1 : -1;

    const anchor = ap.orient == "bottom" || ap.orient == "left" ? 1 : 0;

    const createTicks = () => ({
        name: "chromosome_ticks",
        mark: {
            type: "rule",
            strokeDash: axisProps.chromTickDash,
            strokeDashOffset: axisProps.chromTickDashOffset
        },
        encoding: {
            [secondary]: { value: anchor },
            [secondary + "2"]: {
                value:
                    anchor - (ap.chromTickSize / ap.extent) * (anchor ? 1 : -1)
            },
            color: { value: axisProps.chromTickColor },
            size: { value: ap.chromTickWidth }
        }
    });

    const createLabels = () => ({
        name: "chromosome_labels",
        mark: {
            type: "text",
            align: axisProps.chromLabelAlign,
            baseline:
                main == "y"
                    ? "middle"
                    : ap.orient == "bottom"
                    ? "top"
                    : "alphabetic",
            ["d" + secondary]: ap.chromLabelPadding * offsetDirection
        },
        encoding: {
            [main + "2"]: { field: "continuousEnd", type: "locus" },
            text: { field: "name", type: "ordinal" },
            [secondary]: { value: anchor },
            size: { value: ap.chromLabelFontSize },
            color: { value: ap.chromLabelColor }
        }
    });

    // Create an ordinary axis
    const axisSpec = createAxis(axisProps);

    if (axisProps.chromTicks || axisProps.chromLabels) {
        const chromLayerSpec = {
            // TODO: Configuration
            name: CHROM_LAYER_NAME,
            data: { values: [] },
            encoding: {
                // TODO: { chrom: "name", type: "locus" } // without pos = pos is 0
                [main]: { field: "continuousStart", type: "locus" }
            },
            layer: []
        };

        if (axisProps.chromTicks) {
            chromLayerSpec.layer.push(createTicks());
        }

        if (axisProps.chromLabels) {
            chromLayerSpec.layer.push(createLabels());
        }

        axisSpec.layer.push(chromLayerSpec);
    }

    console.log(axisSpec);

    return axisSpec;
}
