import ContainerView from "./containerView";
import AxisView from "./axisView";
import { getFlattenedViews } from "./viewUtils";
import Padding from "../utils/layout/padding";
import UnitView from "./unitView";

/**
 * @typedef {import("../spec/channel").PositionalChannel} PositionalChannel
 * @typedef {import("../spec/view").GeometricDimension} GeometricDimension
 */

/** @type {Record<PositionalChannel, AxisOrient[]>} */
const CHANNEL_ORIENTS = {
    x: ["bottom", "top"],
    y: ["left", "right"],
};

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
export default class DecoratorView extends ContainerView {
    /**
     * @param {import("./viewUtils").ViewContext} context
     * @param {import("./containerView").default} parent
     */
    constructor(context, parent) {
        super({}, context, parent, "decorator");

        /** @type { import("./layerView").default | import("./unitView").default } */
        this.child = undefined;

        /** @type {UnitView} */
        this.backgroundView = undefined;

        /** @type {Record<AxisOrient, AxisView>} */
        this.axisViews = {
            top: undefined,
            right: undefined,
            bottom: undefined,
            left: undefined,
        };

        ["mousedown", "wheel"].forEach((type) =>
            this.addInteractionEventListener(
                type,
                this.handleMouseEvent.bind(this)
            )
        );
    }

    /**
     * Creates the axis views
     *
     * TODO: Perhaps views need a common initialization method?
     */
    initialize() {
        Object.entries(CHANNEL_ORIENTS).forEach(([channel, orients]) =>
            this._initializeAxes(channel, orients)
        );
        this._invalidateCacheByPrefix("size/", "ancestors");

        // TODO: Merge viewConfig from all descendants (when there are layers)
        // TODO: Implement styles

        const viewConfig = this.child.spec?.view;
        if (viewConfig?.fill || viewConfig?.stroke) {
            this.backgroundView = new UnitView(
                createBackground(viewConfig),
                this.context,
                this,
                "background"
            );
        }
    }

    /**
     * @param {View} [whoIsAsking] Passed to the immediate parent. Allows for
     *      selectively breaking the inheritance.
     */
    getEncoding(whoIsAsking) {
        if (
            Object.values(this.axisViews).find(
                (view) => whoIsAsking === view
            ) ||
            whoIsAsking == this.backgroundView
        ) {
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
        if (this.backgroundView) {
            yield this.backgroundView;
        }
        for (const view of Object.values(this.axisViews)) {
            if (view) {
                yield view;
            }
        }
    }

    _getAxisExtents() {
        return this._cache("size/axisExtents", () => {
            /** @type {Record<AxisOrient, number>} */
            // @ts-ignore
            const paddings = {};
            for (const view of Object.values(this.axisViews)) {
                if (view) {
                    paddings[view.getOrient()] = view.getPerpendicularSize();
                }
            }
            return Padding.createFromRecord(paddings);
        });
    }

    _getAxisOffsets() {
        return this._cache("size/axisOffsets", () => {
            /** @type {Record<AxisOrient, number>} */
            // @ts-ignore
            const paddings = {};
            for (const view of Object.values(this.axisViews)) {
                if (view) {
                    paddings[view.getOrient()] = view.axisProps.offset;
                }
            }
            return Padding.createFromRecord(paddings);
        });
    }

    getEffectivePadding() {
        // TODO: Handle negative axis extents
        return this._cache("size/effectivePadding", () =>
            this.getPadding().add(this._getAxisExtents())
        );
    }

    getSize() {
        return this._cache("size/size", () =>
            this.getSizeFromSpec()
                .addPadding(this.getPadding())
                .addPadding(this.getAxisSizes())
        );
    }

    /**
     * Returns the amount of extra space the axes need on the plot edges.
     * The calculation takes axis offsets into account.
     *
     * @returns {Padding}
     */
    getAxisSizes() {
        // TODO: Clamp negative sizes (if axes are positioned entirely onto the plots)
        return this._cache("size/axisSizes", () =>
            this._getAxisExtents().add(this._getAxisOffsets())
        );
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

        coords = coords.shrink(this.getPadding());
        context.pushView(this, coords);

        const extents = this._getAxisExtents();
        const childCoords = coords.shrink(extents.add(this._getAxisOffsets()));

        this._childCoords = childCoords;

        if (this.backgroundView) {
            this.backgroundView.render(context, childCoords, options);
        }

        this.child.render(context, childCoords, options);

        const entries = this._cache("axisViewEntries", () =>
            Object.entries(this.axisViews).filter((e) => !!e[1])
        );

        for (const [orient, view] of entries) {
            const props = view.axisProps;

            /** @type {import("../utils/layout/rectangle").default} */
            let axisCoords;

            if (orient == "bottom") {
                axisCoords = childCoords
                    .translate(0, childCoords.height + props.offset)
                    .modify({ height: extents.bottom });
            } else if (orient == "top") {
                axisCoords = childCoords
                    .translate(0, -extents.top - props.offset)
                    .modify({ height: extents.top });
            } else if (orient == "left") {
                axisCoords = childCoords
                    .translate(-extents.left - props.offset, 0)
                    .modify({ width: extents.left });
            } else if (orient == "right") {
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
     * @param {AxisOrient[]} orients
     */
    _initializeAxes(channel, orients) {
        const resolutions = this._getResolutionParticipants()
            .map((view) => view.resolutions.axis[channel])
            .filter((resolution) => resolution);

        // First, fill the preferred slots
        for (const r of resolutions) {
            const axisProps = r.getAxisProps();
            if (axisProps && axisProps.orient) {
                if (!orients.includes(axisProps.orient)) {
                    throw new Error(
                        `Invalid axis orientation for '${channel}' channel: ${axisProps.orient}`
                    );
                }
                if (this.axisViews[axisProps.orient]) {
                    throw new Error(
                        `The slot for ${axisProps.orient} axis is already reserved!`
                    );
                }
                this.axisViews[axisProps.orient] = new AxisView(
                    {
                        ...axisProps,
                        title: r.getTitle(),
                    },
                    r.scaleResolution.type,
                    this.context,
                    this
                );
            }
        }

        // Next, fill the slots in the preferred order
        // eslint-disable-next-line no-labels
        resolutionLoop: for (const r of resolutions) {
            const axisProps = r.getAxisProps();
            if (axisProps && !axisProps.orient) {
                for (const slot of orients) {
                    if (!this.axisViews[slot]) {
                        axisProps.orient = /** @type {AxisOrient} */ (slot);
                        this.axisViews[slot] = new AxisView(
                            {
                                ...axisProps,
                                title: r.getTitle(),
                            },
                            r.scaleResolution.type,
                            this.context,
                            this
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

            const wheelEvent = /** @type {WheelEvent} */ (event.uiEvent);
            const wheelMultiplier = wheelEvent.deltaMode ? 120 : 1;

            let { x, y } = event.point;

            // Snapping to the hovered item:
            // We find the currently hovered object and move the pointed coordinates
            // to its center if the mark has only primary positional channels.
            // This allows the user to rapidly zoom closer without having to
            // continuously adjust the cursor position.

            const hover = this.context.getCurrentHover();
            if (hover) {
                const viewCoords = coords.shrink(this.getEffectivePadding());

                const e = hover.mark.encoders;
                if (e.x && !e.x2) {
                    x = +e.x(hover.datum) * viewCoords.width + viewCoords.x;
                }
                if (e.y && !e.y2) {
                    y =
                        (1 - +e.y(hover.datum)) * viewCoords.height +
                        viewCoords.y;
                }
            }

            if (Math.abs(wheelEvent.deltaX) < Math.abs(wheelEvent.deltaY)) {
                this._handleZoom(coords, {
                    x,
                    y,
                    xDelta: 0,
                    yDelta: 0,
                    zDelta: (wheelEvent.deltaY * wheelMultiplier) / 300,
                });
            } else {
                this._handleZoom(coords, {
                    x,
                    y,
                    xDelta: -wheelEvent.deltaX * wheelMultiplier,
                    yDelta: 0,
                    zDelta: 0,
                });
            }
        } else if (event.type == "mousedown" && event.uiEvent.button === 0) {
            const mouseEvent = /** @type {MouseEvent} */ (event.uiEvent);
            mouseEvent.preventDefault();

            let prevMouseEvent = mouseEvent;

            const onMousemove = /** @param {MouseEvent} moveEvent */ (
                moveEvent
            ) => {
                this._handleZoom(coords, {
                    x: prevMouseEvent.clientX,
                    y: prevMouseEvent.clientY,
                    xDelta: moveEvent.clientX - prevMouseEvent.clientX,
                    yDelta: moveEvent.clientY - prevMouseEvent.clientY,
                    zDelta: 0,
                });

                prevMouseEvent = moveEvent;
            };

            const onMouseup = /** @param {MouseEvent} upEvent */ (upEvent) => {
                document.removeEventListener("mousemove", onMousemove);
                document.removeEventListener("mouseup", onMouseup);
            };

            document.addEventListener("mouseup", onMouseup, false);
            document.addEventListener("mousemove", onMousemove, false);
        }
    }

    isZoomable() {
        return this._cache("zoomable", () =>
            Object.values(this._getZoomableResolutions()).some(
                (set) => set.size
            )
        );
    }

    _getZoomableResolutions() {
        return this._cache("zoomableResolutions", () => {
            /** @type {Record<import("../spec/channel").PositionalChannel, Set<import("./scaleResolution").default>>} */
            const resolutions = {
                x: new Set(),
                y: new Set(),
            };

            // Find all resolutions (scales) that are candidates for zooming
            this.child.visit((v) => {
                for (const [channel, resolutionSet] of Object.entries(
                    resolutions
                )) {
                    const resolution = v.getScaleResolution(channel);
                    if (resolution && resolution.isZoomable()) {
                        resolutionSet.add(resolution);
                    }
                }
            });

            return resolutions;
        });
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
                y: tp.y - p.y,
            };

            for (const resolution of resolutionSet) {
                resolution.zoom(
                    2 ** zoomEvent.zDelta,
                    channel == "y"
                        ? 1 - p[/** @type {PositionalChannel} */ (channel)]
                        : p[/** @type {PositionalChannel} */ (channel)],
                    channel == "x" ? delta.x : -delta.y
                );
            }
        }

        this.context.animator.requestRender();
    }
}

/**
 * @param {import("../spec/view").ViewConfig} viewConfig
 * @returns {import("../spec/view").UnitSpec}
 */
function createBackground(viewConfig) {
    return {
        data: { values: [{}] },
        mark: {
            fill: null,
            strokeWidth: 1.0,
            ...viewConfig,
            type: "rect",
            clip: false, // Shouldn't be needed
            tooltip: null,
        },
    };
}
