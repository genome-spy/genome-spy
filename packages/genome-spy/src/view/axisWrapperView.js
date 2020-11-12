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

/** @type {Record<AxisOrient, PositionalChannel>} */
const SLOT_CHANNELS = Object.fromEntries(
    Object.entries(CHANNEL_SLOTS)
        .map(([channel, slots]) => slots.map(slot => [slot, channel]))
        .flat(1)
);

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
    return SLOT_CHANNELS[slot];
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
 *
 * @typedef {object} ZoomEvent
 * @prop {number} x
 * @prop {number} y
 * @prop {number} xDelta
 * @prop {number} yDelta
 * @prop {number} zDelta
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

        /** @type {Set<PositionalChannel>} */
        this._requestedAxisUpdates = new Set();

        this._addBroadcastHandler("layout", () => this.requestAxisUpdate());

        ["mousedown", "wheel"].forEach(type =>
            this.addEventListener(type, this.handleMouseEvent.bind(this))
        );
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
     * @param {View} [whoIsAsking] Passed to the immediate parent. Allows for
     *      selectively breaking the inheritance.
     * @return {function(object):any}
     */
    getFacetAccessor(whoIsAsking) {
        if (whoIsAsking != this.child) {
            // Axes have no facets
            return;
        }

        if (this.parent) {
            return this.parent.getFacetAccessor(this);
        }
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

    /**
     * Sets a channel "dirty", signaling that new ticks should be computed
     * for the associated axes.
     *
     * @param {PositionalChannel} [channel] Affected channel. If undefined, all
     *      channels are considered dirty.
     */
    requestAxisUpdate(channel) {
        if (channel) {
            this._requestedAxisUpdates.add(channel);
        } else {
            this._requestedAxisUpdates.add("x");
            this._requestedAxisUpdates.add("y");
        }
    }

    _updateAxisData() {
        for (const [slot, view] of Object.entries(this.axisViews)) {
            if (view && this._requestedAxisUpdates.has(slot2channel(slot))) {
                const channel = slot2channel(/** @type {AxisOrient} */ (slot));
                const scale = this.getResolution(channel).getScale();
                const oldTicks = (view.data && [...view.data.flatData()]) || [];
                const newTicks = generateTicks(
                    this.axisProps[slot],
                    scale,
                    this._childCoords[CHANNEL_DIMENSIONS[channel]],
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

        this._requestedAxisUpdates.clear();
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

    _getAxisExtents() {
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

    _getAxisOffsets() {
        return Padding.createFromRecord(
            Object.fromEntries(
                Object.entries(this.axisProps).map(([slot, props]) => [
                    slot,
                    props ? props.offset : 0
                ])
            )
        );
    }

    getEffectivePadding() {
        // TODO: Handle negative axis extents
        return this.getPadding().add(this._getAxisExtents());
    }

    getSize() {
        const size = super.getSize();
        const padding = this.getAxisSizes();
        size.width.px = (size.width.px || 0) + padding.width;
        size.height.px = (size.height.px || 0) + padding.height;
        return size;
    }

    /**
     * Returns the amount of extra space the axes need on the plot edges.
     * The calculation takes axis offsets into account.
     *
     * @returns {Padding}
     */
    getAxisSizes() {
        // TODO: Clamp negative sizes (if axes are positioned entirely onto the plots)
        return this._getAxisExtents().add(this._getAxisOffsets());
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext").default} context
     * @param {import("../utils/layout/rectangle").default} coords
     * @param {import("./view").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        coords = coords.shrink(this.getPadding());
        context.pushView(this, coords);

        const extents = this._getAxisExtents();
        const childCoords = coords.shrink(extents.add(this._getAxisOffsets()));

        this._childCoords = childCoords;

        this.child.render(context, childCoords, options);

        this._updateAxisData();

        for (const [slot, view] of Object.entries(this.axisViews)) {
            if (!view) {
                continue;
            }

            const props = this.axisProps[slot];

            /** @type {import("../utils/layout/rectangle").default} */
            let axisCoords;

            if (slot == "bottom") {
                axisCoords = childCoords
                    .translate(0, childCoords.height + props.offset)
                    .modify({ height: extents.bottom });
            } else if (slot == "top") {
                axisCoords = childCoords
                    .translate(0, -extents.top - props.offset)
                    .modify({ height: extents.top });
            } else if (slot == "left") {
                axisCoords = childCoords
                    .translate(-extents.left - props.offset, 0)
                    .modify({ width: extents.left });
            } else if (slot == "right") {
                axisCoords = childCoords
                    .translate(childCoords.width + props.offset, 0)
                    .modify({ width: extents.right });
            }

            // Axes have no faceted data, thus, pass undefined facetId
            view.render(context, axisCoords);
        }

        context.popView(this);
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
     * @param {import("../utils/layout/rectangle").default} coords
     *      Coordinates of the view
     * @param {import("../utils/interactionEvent").default} event
     */
    handleMouseEvent(coords, event) {
        if (!this.isZoomable()) {
            return;
        }

        // TODO: Extract a class or something

        if (event.type == "wheel") {
            event.uiEvent.preventDefault(); // TODO: Only if there was something to zoom

            const mouseEvent = /** @type {MouseEvent} */ (event.uiEvent);
            const wheelMultiplier = mouseEvent.deltaMode ? 120 : 1;

            if (Math.abs(mouseEvent.deltaX) < Math.abs(mouseEvent.deltaY)) {
                this._handleZoom(coords, {
                    x: event.point.x,
                    y: event.point.y,
                    xDelta: 0,
                    yDelta: 0,
                    zDelta: (mouseEvent.deltaY * wheelMultiplier) / 300
                });
            } else {
                this._handleZoom(coords, {
                    x: event.point.x,
                    y: event.point.y,
                    xDelta: -mouseEvent.deltaX * wheelMultiplier,
                    yDelta: 0,
                    zDelta: 0
                });
            }
        } else if (event.type == "mousedown" && event.uiEvent.button === 0) {
            const mouseEvent = /** @type {MouseEvent} */ (event.uiEvent);
            mouseEvent.preventDefault();

            let prevMouseEvent = mouseEvent;

            const onMousemove = /** @param {MouseEvent} moveEvent */ moveEvent => {
                this._handleZoom(coords, {
                    x: prevMouseEvent.clientX,
                    y: prevMouseEvent.clientY,
                    xDelta: moveEvent.clientX - prevMouseEvent.clientX,
                    yDelta: moveEvent.clientY - prevMouseEvent.clientY,
                    zDelta: 0
                });

                prevMouseEvent = moveEvent;
            };

            const onMouseup = /** @param {MouseEvent} upEvent */ upEvent => {
                document.removeEventListener("mousemove", onMousemove);
                document.removeEventListener("mouseup", onMouseup);
            };

            document.addEventListener("mouseup", onMouseup, false);
            document.addEventListener("mousemove", onMousemove, false);
        }
    }

    isZoomable() {
        return Object.values(this._getZoomableResolutions()).some(
            set => set.size
        );
    }

    _getZoomableResolutions() {
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

        return resolutions;
    }

    /**
     *
     * @param {import("../utils/layout/rectangle").default} coords Coordinates
     * @param {ZoomEvent} zoomEvent
     */
    _handleZoom(coords, zoomEvent) {
        for (const [channel, resolutionSet] of Object.entries(
            this._getZoomableResolutions()
        )) {
            if (resolutionSet.size <= 0) {
                continue;
            }

            const extents = this._getAxisExtents();
            const childCoords = coords.shrink(
                extents.add(this._getAxisOffsets())
            );

            const p = childCoords.normalizePoint(zoomEvent.x, zoomEvent.y);
            const tp = childCoords.normalizePoint(
                zoomEvent.x + zoomEvent.xDelta,
                zoomEvent.y + zoomEvent.yDelta
            );

            const delta = {
                x: tp.x - p.x,
                y: tp.y - p.y
            };

            for (const resolution of resolutionSet) {
                resolution.zoom(
                    2 ** zoomEvent.zDelta,
                    channel == "y"
                        ? 1 - p[/** @type {PositionalChannel} */ (channel)]
                        : p[/** @type {PositionalChannel} */ (channel)],
                    channel == "x" ? delta.x : -delta.y
                );

                resolution.views.forEach(view =>
                    findClosestAxisWrapper(view).requestAxisUpdate(channel)
                );
            }
        }

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
    domainCap: "square", // Make 1px caps crisp

    ticks: true,
    tickSize: 5,
    tickWidth: 1,
    tickColor: "gray",
    /** @type {number[]} */
    tickDash: null,
    tickCap: "square", // Make 1px caps crisp

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
            strokeDash: ap.domainDash,
            strokeCap: ap.domainCap
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
            strokeCap: ap.tickCap,
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
    chromTickSize: 18,
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
            ["d" + secondary]: ap.chromLabelPadding * offsetDirection,
            clip: false,
            viewportEdgeFadeWidth: [0, 20, 0, 20],
            viewportEdgeFadeDistance: [undefined, -10, undefined, -20]
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

            axisSpec.layer
                .filter(view => view.name == "ticks_and_labels")
                .forEach(view =>
                    view.layer
                        .filter(view => view.name == "labels")
                        .forEach(view => {
                            view.mark.viewportEdgeFadeWidth = [0, 0, 0, 30];
                            view.mark.viewportEdgeFadeDistance = [
                                undefined,
                                undefined,
                                undefined,
                                40
                            ];
                        })
                );
        }

        axisSpec.layer.push(chromLayerSpec);
    }

    return axisSpec;
}
