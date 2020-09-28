import { validTicks, tickValues, tickFormat, tickCount } from "../scale/ticks";
import ContainerView from "./containerView";
import { getFlattenedViews, initializeData } from "./viewUtils";
import LayerView from "./layerView";
import UnitView from "./unitView";
import Padding from "../utils/layout/padding";
import { isNumber } from "vega-util";

/**
 * TODO: Move these somewhere for common use
 * @typedef {import("../spec/view").PositionalChannel} PositionalChannel
 * @typedef {import("../spec/view").GeometricDimension} GeometricDimension
 */

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
 * A view that wraps a unit or layer view and takes care of the axes.
 *
 * @typedef {import("../spec/view").LayerSpec} LayerSpec
 * @typedef {import("./view").default} View
 * @typedef {import("../spec/axis").Axis} Axis
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

        // Hack
        this.context.glHelper.addEventListener("repaint", () => {
            for (const view of Object.values(this.axisViews)) {
                if (view) {
                    initializeData(view).then(() => {
                        view.visit(view => {
                            if (view instanceof UnitView) {
                                view.mark.updateGraphicsData();
                            }
                        });
                    });
                }
            }
        });
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        for (const view of Object.values(this.axisViews)) {
            if (view) {
                yield view;
            }
        }
        yield this.child;
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

    getPadding() {
        /** @type {Record<AxisOrient, number>} */
        // @ts-ignore
        const paddings = {};
        for (const slot of /** @type {AxisOrient[]} */ (Object.keys(
            this.axisViews
        ))) {
            paddings[slot] = this._getAxisSize(slot);
        }
        return new Padding(paddings);
    }

    getSize() {
        const size = super.getSize();
        const padding = this.getPadding();
        size.width.px = (size.width.px || 0) + padding.width;
        size.height.px = (size.height.px || 0) + padding.height;
        return size;
    }

    /**
     * @param { import("./layerView").default | import("./unitView").default} view
     */
    getChildCoords(view) {
        const padding = this.getPadding();

        if (view === this.child) {
            return this.getCoords().shrink(padding);
        } else {
            // TODO: Don't use paddings here because padding could eventually contain some extra.
            const childCoords = this.child.getCoords();
            if (view === this.axisViews.bottom) {
                return childCoords
                    .translate(0, childCoords.height)
                    .modify({ height: padding.bottom });
            } else if (view === this.axisViews.top) {
                return childCoords
                    .translate(0, -padding.top)
                    .modify({ height: padding.top });
            } else if (view === this.axisViews.left) {
                return childCoords
                    .translate(-padding.left, 0)
                    .modify({ width: padding.left });
            } else if (view === this.axisViews.right) {
                return childCoords
                    .translate(childCoords.width, 0)
                    .modify({ width: padding.right });
            } else {
                throw new Error("Not my child view!");
            }
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
                    { ...axisProps, title: r.getTitle() },
                    r
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
                            { ...axisProps, title: r.getTitle() },
                            r
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
     * @param {import("./resolution").default} resolution
     */
    _createAxisView(axisProps, resolution) {
        // TODO: Compute extent
        const fullAxisProps = { ...defaultAxisProps, ...axisProps };

        const tickGenerator = () => {
            try {
                // getScale only works after data have been loaded.
                const scale = resolution.getScale();
                return generateTicks(
                    fullAxisProps,
                    scale,
                    // TODO: A method for getting view's content rectangle
                    this.getChildCoords(this.child)[
                        CHANNEL_DIMENSIONS[slot2channel(axisProps.orient)]
                    ]
                );
            } catch (e) {
                // Scale not available
                // TODO: A cleaner solution, something like "isDataAndScaleReady".
            }
            return [];
        };

        return new LayerView(
            createAxis(fullAxisProps, tickGenerator),
            this.context,
            this,
            `axis_${axisProps.orient}`
        );
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
        if (mainChannel == "x") {
            extent += axisProps.titlePadding + axisProps.titleFontSize;
        } else {
            console.log("y axis title is not yet supported!");
        }
    }

    extent = Math.min(
        axisProps.maxExtent || Infinity,
        Math.max(axisProps.minExtent || 0, extent)
    );

    return extent;
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
    titlePadding: 5

    // TODO: titleX, titleY, titleAngle, titleAlign, etc
};

/**
 * @param {Axis} axisProps
 * @param {any} scale
 * @param {number} axisLength Length of axis in pixels
 */
function generateTicks(axisProps, scale, axisLength) {
    /**
     * @param {number} edge0
     * @param {number} edge1
     * @param {number} x
     */
    const smoothstep = (edge0, edge1, x) => {
        x = (x - edge0) / (edge1 - edge0);
        x = Math.max(0, Math.min(1, x));
        return x * x * (3 - 2 * x);
    };

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
        : tickValues(scale, count);

    const format = tickFormat(scale, count, axisProps.format);

    return values.map(x => ({ value: x, label: format(x) }));
}

/**
 * @param {Axis} axisProps
 * @param {import("../spec/data").DynamicDataset} tickProvider
 * @returns {LayerSpec}
 */
export function createAxis(axisProps, tickProvider) {
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
            yOffset: ap.offset,
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
            align:
                main == "x" ? "center" : ap.orient == "left" ? "right" : "left",
            baseline:
                main == "y"
                    ? "middle"
                    : ap.orient == "bottom"
                    ? "top"
                    : "alphabetic",
            ["d" + secondary]: (ap.tickSize + ap.labelPadding) * offsetDirection
        },
        encoding: {
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
            strokeDash: ap.tickDash
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
            align: "center",
            baseline: ap.orient == "bottom" ? "bottom" : "top",
            dy: -2 * offsetDirection // Not necessary after clipping can be disabled
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
        data: { dynamicSource: tickProvider },
        layer: []
    };

    if (ap.domain) {
        axisSpec.layer.push(createDomain());
    }

    if (ap.ticks || ap.labels) {
        axisSpec.layer.push(createTicksAndLabels());
    }

    if (ap.title && main == "x") {
        // TODO: Implement rotated text to support "y" axis
        axisSpec.layer.push(createTitle());
    }

    return axisSpec;
}
