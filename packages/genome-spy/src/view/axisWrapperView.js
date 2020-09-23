import { validTicks, tickValues, tickFormat, tickCount } from "../scale/ticks";
import ContainerView from "./containerView";
import { getFlattenedViews, initializeData } from "./viewUtils";
import LayerView from "./layerView";
import UnitView from "./unitView";
import Padding from "../utils/layout/padding";

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
        Object.entries(CHANNEL_SLOTS).map(([channel, slots]) =>
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
        // TODO: Fix! Currently this finds only shared scales/axes.
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
                    axisProps,
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
                            axisProps,
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
        const tickGenerator = () => {
            try {
                // getScale only works after data have been loaded.
                const scale = resolution.getScale();
                //return generateTicks(axisProps, scale, this.getCoords().size);
                return generateTicks(
                    axisProps,
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
            createAxis(
                { ...defaultAxisProps, ...axisProps, extent: 20 }, // TODO: Compute extent
                tickGenerator
            ),
            this.context,
            this,
            `axis_${axisProps.orient}`
        );
    }
}

// Based on: https://vega.github.io/vega-lite/docs/axis.html
/** @type {Axis} */
const defaultAxisProps = {
    /** @type {number[] | string[] | boolean[]} */
    values: null,

    minExtent: 30, // TODO
    maxExtent: Infinity, // TODO
    offset: 0,

    domain: true,
    domainWidth: 1,
    domainColor: "gray",

    ticks: true,
    tickSize: 6,
    tickWidth: 1,
    tickColor: "gray",

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
};

/**
 * @param {Axis} axisProps
 * @param {any} scale
 * @param {number} axisLength Length of axis in pixels
 */
function generateTicks(axisProps, scale, axisLength) {
    /** @type {PositionalChannel} */
    const mainAxis = "x";

    let count =
        axisProps.tickCount || mainAxis == "y"
            ? // Slightly decrease the tick density as the height increases
              Math.round(
                  axisLength /
                      Math.exp(axisLength / 800) /
                      axisProps.labelFontSize /
                      1.7
              )
            : Math.round(axisLength / 80); // TODO: Make dynamic

    count = tickCount(scale, count, axisProps.tickMinStep);

    const values = axisProps.values
        ? validTicks(scale, axisProps.values, count)
        : tickValues(scale, count);

    const format = tickFormat(scale, count, axisProps.format);

    return values.map(x => ({ value: x, label: format(x) }));
}

/**
 * @param {AugmentedAxis} axisProps
 * @returns {import("../spec/view").UnitSpec}
 */
function createDomain(axisProps) {
    return {
        name: "domain",
        data: { values: [0] },
        mark: {
            type: "rule",
            yOffset: axisProps.offset,
            size: axisProps.domainWidth
        },
        encoding: {
            color: { value: axisProps.domainColor },
            y: { value: 1 },
            x: { value: -Infinity },
            x2: { value: Infinity }
        }
    };
}

/**
 * @param {AugmentedAxis} axisProps
 * @returns {LayerSpec}
 */
function createTicksAndLabels(axisProps) {
    const createLabels = () => ({
        name: "labels",
        mark: {
            type: "text",
            align: "center",
            baseline: "top",
            dy: axisProps.tickSize + axisProps.labelPadding
        },
        encoding: {
            text: { field: "label", type: "quantitative" },
            y: { value: 1 },
            size: { value: axisProps.labelFontSize },
            color: { value: axisProps.labelColor }
        }
    });

    const createTicks = () => ({
        name: "ticks",
        mark: "rule",
        encoding: {
            y: { value: 1.0 },
            y2: { value: 1.0 - axisProps.tickSize / axisProps.extent },
            color: { value: axisProps.tickColor }
        }
    });

    /** @type {LayerSpec} */
    const spec = {
        name: "ticks_and_labels",
        encoding: {
            x: { field: "value", type: "quantitative" }
        },
        layer: []
    };

    if (axisProps.ticks) {
        spec.layer.push(createTicks());
    }

    if (axisProps.labels) {
        spec.layer.push(createLabels());
    }

    return spec;
}

/**
 * @param {AugmentedAxis} axisProps
 * @returns {import("../spec/view").UnitSpec}
 */
function createTitle(axisProps) {
    return {
        name: "title",
        data: { values: [0] },
        mark: {
            type: "text",
            align: "center",
            dy: -2
        },
        encoding: {
            text: { value: axisProps.title },
            color: { value: axisProps.titleColor },
            x: { value: 3.141 },
            y: { value: 0 }
        }
    };
}

/**
 * @param {AugmentedAxis} axisProps
 * @param {import("../spec/data").DynamicDataset} tickProvider
 * @returns {LayerSpec}
 */
export function createAxis(axisProps, tickProvider) {
    // TODO: Ensure that no channels except the positional ones are shared

    /** @type {LayerSpec} */
    const axisSpec = {
        height: axisProps.extent,
        data: { dynamicSource: tickProvider },
        layer: []
    };

    if (axisProps.domain) {
        axisSpec.layer.push(createDomain(axisProps));
    }

    axisSpec.layer.push(createTicksAndLabels(axisProps));

    if (axisProps.title) {
        axisSpec.layer.push(createTitle(axisProps));
    }

    return axisSpec;
}
