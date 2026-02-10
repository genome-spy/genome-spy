import { isContinuous } from "vega-scale";
import {
    asSelectionConfig,
    createIntervalSelection,
    isActiveIntervalSelection,
    isIntervalSelectionConfig,
    selectionContainsPoint,
} from "../../selection/selection.js";
import AxisGridView from "../axisGridView.js";
import AxisView, { CHANNEL_ORIENTS } from "../axisView.js";
import LayerView from "../layerView.js";
import Padding from "../layout/padding.js";
import Point from "../layout/point.js";
import Rectangle from "../layout/rectangle.js";
import createTitle from "../title.js";
import UnitView from "../unitView.js";
import { markViewAsNonAddressable } from "../viewSelectors.js";
import Scrollbar from "./scrollbar.js";
import SelectionRect from "./selectionRect.js";

export default class GridChild {
    /**
     * Users guide:
     * - GridChild is owned by GridView and is not meant to be instantiated or
     *   managed directly by callers.
     * - Use GridView/ConcatView APIs for insertion/removal so decorations and
     *   dataflow are kept in sync.
     */

    /**
     * @param {import("../view.js").default} view
     * @param {import("../containerView.js").default} layoutParent
     * @param {number} serial
     */
    constructor(view, layoutParent, serial) {
        this.layoutParent = layoutParent;
        this.view = view;
        this.serial = serial;

        /** @type {UnitView} */
        this.background = undefined;

        /** @type {UnitView} */
        this.backgroundStroke = undefined;

        /** @type {Partial<Record<import("../../spec/axis.js").AxisOrient, AxisView>>} axes */
        this.axes = {};

        /** @type {Partial<Record<import("../../spec/axis.js").AxisOrient, AxisGridView>>} gridLines */
        this.gridLines = {};

        /** @type {Partial<Record<import("./scrollbar.js").ScrollDirection, Scrollbar>>} */
        this.scrollbars = {};

        /** @type {SelectionRect} */
        this.selectionRect = undefined;

        /** @type {UnitView} */
        this.title = undefined;

        /** @type {Rectangle} */
        this.coords = Rectangle.ZERO;

        if (view.needsAxes.x || view.needsAxes.y) {
            const spec = view.spec;
            const viewBackground = "view" in spec ? spec?.view : undefined;

            const backgroundSpec = createBackground(viewBackground);
            if (backgroundSpec) {
                this.background = new UnitView(
                    backgroundSpec,
                    layoutParent.context,
                    layoutParent,
                    view,
                    "background" + serial,
                    {
                        blockEncodingInheritance: true,
                    }
                );
                markViewAsNonAddressable(this.background, {
                    skipSubtree: true,
                });
            }

            const backgroundStrokeSpec = createBackgroundStroke(viewBackground);
            if (backgroundStrokeSpec) {
                this.backgroundStroke = new UnitView(
                    backgroundStrokeSpec,
                    layoutParent.context,
                    layoutParent,
                    view,
                    "backgroundStroke" + serial,
                    {
                        blockEncodingInheritance: true,
                    }
                );
                markViewAsNonAddressable(this.backgroundStroke, {
                    skipSubtree: true,
                });
            }

            const title = createTitle(view.spec.title);
            if (title) {
                const unitView = new UnitView(
                    title,
                    layoutParent.context,
                    layoutParent,
                    view,
                    "title" + serial,
                    {
                        blockEncodingInheritance: true,
                    }
                );
                this.title = unitView;
                markViewAsNonAddressable(this.title, { skipSubtree: true });
            }
        }

        // TODO: More specific getter for this
        if (view.spec.viewportWidth != null) {
            this.scrollbars.horizontal = new Scrollbar(this, "horizontal");
        }

        if (view.spec.viewportHeight != null) {
            this.scrollbars.vertical = new Scrollbar(this, "vertical");
        }

        this.#setupIntervalSelection();
    }

    #setupIntervalSelection() {
        const view = this.view;

        // TODO: Move to context
        const setCursor = (/** @type {string} */ cursor) => {
            this.view.context.glHelper.canvas.style.cursor = cursor;
        };

        // TODO: If the child is a LayerView, selection params should be pulled from its children as well
        for (const [name, param] of view.paramRuntime.paramConfigs) {
            if (!("select" in param)) {
                continue;
            }

            const select = asSelectionConfig(param.select);

            if (!isIntervalSelectionConfig(select)) {
                continue;
            }

            const channels = select.encodings;

            const scaleResolutions = Object.fromEntries(
                channels.map((channel) => {
                    const resolution = this.view.getScaleResolution(channel);
                    const scale = resolution?.getScale();

                    if (!scale || !isContinuous(scale.type)) {
                        throw new Error(
                            `No continuous scale found for interval selection param "${name}" on channel "${channel}"! Scale type is "${scale?.type ?? "none"}".`
                        );
                    }
                    return [channel, resolution];
                })
            );

            if (this.selectionRect) {
                throw new Error(
                    "Only one interval selection per container is currently allowed!"
                );
            }

            // --- Validation and early exits done ---

            let mouseOver = false;
            let preventNextClickPropagation = false;
            let nowBrushing = false;

            /**
             * Selection rectangle in screen coordinates. Used when translating
             * an existing selection.
             * @type {Rectangle}
             */
            let translatedRectangle = null;

            /**
             * @param {{x: number, y: number}} a
             * @param {{x: number, y: number}} b
             * @return {Partial<Record<import("../../spec/channel.js").PrimaryPositionalChannel, [number, number]>>}
             */
            const pointsToIntervals = (a, b) =>
                Object.fromEntries(
                    channels.map((channel) => [
                        channel,
                        [
                            Math.min(a[channel], b[channel]),
                            Math.max(a[channel], b[channel]),
                        ],
                    ])
                );

            const selectionExpr = view.paramRuntime.createExpression(name);
            const setter = (
                /** @type {import("../../types/selectionTypes.js").IntervalSelection} */
                selection
            ) => {
                view.paramRuntime.setValue(name, selection);
            };

            if (param.value) {
                setter({ type: "interval", intervals: param.value });
            }

            const clearSelection = () => {
                setter(createIntervalSelection(channels));
                setCursor(null);
            };

            this.selectionRect = new SelectionRect(
                this,
                selectionExpr,
                select.mark
            );

            // WARNING! The following is an async method! Seems to work (by chance).
            // TODO: Should be called and awaited in a sensible place. Maybe provide some
            // registration logic for such post-creation initializations?
            this.selectionRect.initializeChildren();

            const invertPoint = (
                /** @type {import("../layout/point.js").default} */ point
            ) => {
                const inverted = { x: 0, y: 0 };

                const np = view.coords.normalizePoint(point.x, point.y, true);

                for (const channel of channels) {
                    const scale = scaleResolutions[channel].getScale();
                    // @ts-ignore
                    const val = scale.invert(channel == "x" ? np.x : np.y);
                    inverted[channel] =
                        val +
                        (["index", "locus"].includes(scale.type) ? 0.5 : 0);
                }

                return inverted;
            };

            /**
             * Converts the current selection intervals (in scale domain) to a rectangle
             * in screen coordinates.
             * @param {import("../../types/selectionTypes.js").IntervalSelection} selection
             */
            const selectionToRect = (selection) => {
                const { intervals } = selection;

                const mapCorner = (
                    /** @type {number} */ xVal,
                    /** @type {number} */ yVal,
                    /** @type {number} */ i
                ) => {
                    const getCoord = (
                        /** @type {import("../../spec/channel.js").PrimaryPositionalChannel} */ channel,
                        /** @type {number} */ val
                    ) => {
                        if (val == null) return null;
                        return scaleResolutions[channel].getScale()(val);
                    };
                    const px = getCoord("x", xVal) ?? i;
                    const py = getCoord("y", yVal) ?? i;
                    return view.coords.denormalizePoint(px, py, true);
                };

                const a = mapCorner(intervals.x?.[0], intervals.y?.[0], 0);
                const b = mapCorner(intervals.x?.[1], intervals.y?.[1], 1);

                return Rectangle.create(a.x, a.y, b.x - a.x, b.y - a.y);
            };

            view.addInteractionEventListener("mousedown", (coords, event) => {
                if (event.mouseEvent.button != 0) {
                    return;
                }

                // Coordinates of the selection rectangle, if it exists.
                // Must be operated in the view's coordinate system, not in data domain,
                // as non-linear scales may be used.
                translatedRectangle = mouseOver
                    ? selectionToRect(selectionExpr())
                    : null;

                if (translatedRectangle) {
                    // Started dragging an existing selection
                    setCursor("grabbing");
                    // Start of dragging should prevent click propagation so that
                    // no other selections or events are triggered.
                    preventNextClickPropagation = true;
                } else {
                    const mouseDownPoint = event.point;
                    if (isActiveIntervalSelection(selectionExpr())) {
                        // If there's a selection, prevent the next click from propagating.
                        // The first click will clear the selection, not trigger
                        // any other possible selections.
                        preventNextClickPropagation = true;
                    }

                    const startSelection = event.mouseEvent.shiftKey;

                    if (startSelection) {
                        clearSelection();
                        nowBrushing = true;
                    } else if (isActiveIntervalSelection(selectionExpr())) {
                        // If mouse button is released and there was a selection,
                        // it should be cleared unless the viewport was panned by dragging.
                        /** @type {import("../view.js").InteractionEventListener} */
                        const listener = (coords, event) => {
                            view.removeInteractionEventListener(
                                "mouseup",
                                listener
                            );
                            const mouseUpPoint = event.point;

                            // Retain selection if the viewport is panned by dragging
                            const movementThreshold = 2; // pixels
                            if (
                                mouseDownPoint.subtract(mouseUpPoint).length <
                                movementThreshold
                            ) {
                                clearSelection();
                            }
                        };
                        view.addInteractionEventListener("mouseup", listener);
                        return;
                    } else {
                        return;
                    }
                }

                // Prevent panning interaction
                event.stopPropagation();

                const start = event.point;
                const viewOffset = Point.fromMouseEvent(
                    event.mouseEvent
                ).subtract(start);

                const mouseMoveListener = (/** @type {MouseEvent} */ event) => {
                    // This listener is added to the document so that events are captured even if the mouse leaves the view.
                    // Thus, coordinates need to be adjusted to the view's coordinate system.
                    const current =
                        Point.fromMouseEvent(event).subtract(viewOffset);

                    /** @type {ReturnType<typeof pointsToIntervals>} */
                    let intervals;

                    if (translatedRectangle) {
                        const offset = current.subtract(start);
                        const newRect = translatedRectangle.translate(
                            offset.x,
                            offset.y
                        );

                        intervals = pointsToIntervals(
                            invertPoint(new Point(newRect.x, newRect.y)),
                            invertPoint(new Point(newRect.x2, newRect.y2))
                        );
                    } else {
                        intervals = pointsToIntervals(
                            invertPoint(start),
                            invertPoint(current)
                        );
                    }

                    for (const channel of channels) {
                        const scaleResolution = scaleResolutions[channel];
                        const { zoomExtent, scale } = scaleResolution;
                        const interval = intervals[channel];

                        if (["index", "locus"].includes(scale.type)) {
                            // These scales use integer values. Need to round them.
                            interval[0] = Math.ceil(interval[0]);
                            interval[1] = Math.ceil(interval[1]);
                        }

                        if (translatedRectangle) {
                            // When dragging, clamp the interval so that the size stays the same and the interval doesn't exceed zoomExtent
                            const size = interval[1] - interval[0];
                            const min = zoomExtent[0];
                            const max = zoomExtent[1];

                            // Clamp the start and end so the interval stays within bounds
                            // Note: Only works reliably with linear scales. TODO: Handle other scales.
                            if (interval[0] < min) {
                                interval[0] = min;
                                interval[1] = min + size;
                            }
                            if (interval[1] > max) {
                                interval[1] = max;
                                interval[0] = max - size;
                            }
                        } else {
                            interval[0] = Math.max(zoomExtent[0], interval[0]);
                            interval[1] = Math.min(zoomExtent[1], interval[1]);
                        }
                        interval[1] = Math.min(zoomExtent[1], interval[1]);
                    }

                    setter({ type: "interval", intervals });
                };

                const mouseUpListener = () => {
                    document.removeEventListener(
                        "mousemove",
                        mouseMoveListener
                    );
                    document.removeEventListener("mouseup", mouseUpListener);

                    nowBrushing = false;
                    if (translatedRectangle) {
                        setCursor("move");
                        translatedRectangle = null;
                    }
                };
                document.addEventListener("mousemove", mouseMoveListener);

                document.addEventListener("mouseup", mouseUpListener);
            });

            view.addInteractionEventListener(
                "click",
                (coords, event) => {
                    if (event.mouseEvent.button == 0) {
                        if (preventNextClickPropagation) {
                            event.stopPropagation();
                            preventNextClickPropagation = false;
                        }
                    }
                },
                true
            );

            const isPointInsideSelection = (/** @type {Point} */ point) =>
                selectionContainsPoint(selectionExpr(), invertPoint(point));

            // TODO: Make behavior configurable
            view.addInteractionEventListener(
                "dblclick",
                (coords, event) => {
                    if (isPointInsideSelection(event.point)) {
                        clearSelection();
                        event.stopPropagation();
                    }
                },
                true
            );

            // Handle mouse cursor changes
            view.addInteractionEventListener("mousemove", (coords, event) => {
                if (isPointInsideSelection(event.point)) {
                    // Brushing and translating the existing brush are different actions.
                    if (!nowBrushing) {
                        mouseOver = true;
                        // When translation is active, the cursor shows a grabbing hand.
                        if (!translatedRectangle) {
                            setCursor("move");
                        }
                    }
                } else {
                    mouseOver = false;
                    if (!translatedRectangle) {
                        setCursor(null);
                    }
                }
            });
        }
    }

    *getChildren() {
        if (this.background) {
            yield this.background;
        }
        if (this.backgroundStroke) {
            yield this.backgroundStroke;
        }
        if (this.title) {
            yield this.title;
        }
        yield* Object.values(this.axes);
        yield* Object.values(this.gridLines);
        yield this.view;
        yield* Object.values(this.scrollbars);
        if (this.selectionRect) {
            yield this.selectionRect;
        }
    }

    /**
     * Create view decorations, grid lines, axes, etc.
     */
    async createAxes() {
        this.disposeAxisViews();

        const { view, axes, gridLines } = this;

        /**
         * @param {import("../../scales/axisResolution.js").default} r
         * @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel
         */
        const getAxisPropsWithDefaults = (r, channel) => {
            const propsWithoutDefaults = r.getAxisProps();
            if (propsWithoutDefaults === null) {
                return;
            }

            const props = propsWithoutDefaults
                ? { ...propsWithoutDefaults }
                : {};

            // Pick a default orient based on what is available.
            // This logic is needed for layer views that have independent axes.
            if (!props.orient) {
                for (const orient of CHANNEL_ORIENTS[channel]) {
                    if (!axes[orient]) {
                        props.orient = orient;
                        break;
                    }
                }
                if (!props.orient) {
                    throw new Error(
                        "No slots available for an axis! Perhaps a LayerView has more than two children?"
                    );
                }
            }

            props.title ??= r.getTitle();

            if (!CHANNEL_ORIENTS[channel].includes(props.orient)) {
                throw new Error(
                    `Invalid axis orientation "${props.orient}" on channel "${channel}"!`
                );
            }

            return props;
        };

        /**
         * @param {import("../../scales/axisResolution.js").default} r
         * @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel
         * @param {import("../view.js").default} axisParent
         */
        const createAxis = async (r, channel, axisParent) => {
            const props = getAxisPropsWithDefaults(r, channel);

            if (props) {
                if (axes[props.orient]) {
                    throw new Error(
                        `An axis with the orient "${props.orient}" already exists!`
                    );
                }

                const axisView = new AxisView(
                    props,
                    r.scaleResolution.type,
                    this.layoutParent.context,
                    this.layoutParent,
                    axisParent
                );
                axes[props.orient] = axisView;
                await axisView.initializeChildren();
            }
        };

        /**
         * @param {import("../../scales/axisResolution.js").default} r
         * @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel
         * @param {import("../view.js").default} axisParent
         */
        const createAxisGrid = async (r, channel, axisParent) => {
            const props = getAxisPropsWithDefaults(r, channel);

            if (props && (props.grid || props.chromGrid)) {
                const axisGridView = new AxisGridView(
                    props,
                    r.scaleResolution.type,
                    this.layoutParent.context,
                    this.layoutParent,
                    axisParent
                );
                gridLines[props.orient] = axisGridView;
                await axisGridView.initializeChildren();
            }
        };

        // Handle children that have caught axis resolutions. Create axes for them.
        for (const channel of /** @type {import("../../spec/channel.js").PrimaryPositionalChannel[]} */ ([
            "x",
            "y",
        ])) {
            if (view.needsAxes[channel]) {
                const r = view.resolutions.axis[channel];
                if (!r) {
                    continue;
                }

                await createAxis(r, channel, view);
            }
        }

        // Handle gridlines of children. Note: children's axis resolution may be caught by
        // this view or some of this view's ancestors.
        for (const channel of /** @type {import("../../spec/channel.js").PrimaryPositionalChannel[]} */ ([
            "x",
            "y",
        ])) {
            if (
                view.needsAxes[channel] &&
                // Handle a special case where the child view has an excluded resolution
                // but no scale or axis, e.g., when only values are used on a channel.
                view.getConfiguredOrDefaultResolution(channel, "axis") !=
                    "excluded"
            ) {
                const r = view.getAxisResolution(channel);
                if (!r) {
                    continue;
                }

                await createAxisGrid(r, channel, view);
            }
        }

        // Handle LayerView's possible independent axes
        if (view instanceof LayerView) {
            // First create axes that have an orient preference
            for (const layerChild of view) {
                for (const [channel, r] of Object.entries(
                    layerChild.resolutions.axis
                )) {
                    const props = r.getAxisProps();
                    if (props && props.orient) {
                        await createAxis(r, channel, layerChild);
                    }
                }
            }

            // Then create axes in a priority order
            for (const layerChild of view) {
                for (const [channel, r] of Object.entries(
                    layerChild.resolutions.axis
                )) {
                    const props = r.getAxisProps();
                    if (props && !props.orient) {
                        await createAxis(r, channel, layerChild);
                    }
                }
            }

            // TODO: Axis grid
        }

        // Axes are created after scales are resolved, so we need to resolve possible new scales here
        [...Object.values(axes), ...Object.values(gridLines)].forEach((v) =>
            v.visit((view) => {
                if (view instanceof UnitView) {
                    view.resolve("scale");
                }
            })
        );
    }

    /**
     * Disposes axis and gridline views so axes can be recreated safely.
     */
    disposeAxisViews() {
        for (const axisView of Object.values(this.axes)) {
            axisView.disposeSubtree();
        }

        for (const gridView of Object.values(this.gridLines)) {
            gridView.disposeSubtree();
        }

        this.axes = {};
        this.gridLines = {};
    }

    getOverhang() {
        const calculate = (
            /** @type {import("../../spec/axis.js").AxisOrient} */ orient
        ) => {
            const axisView = this.axes[orient];
            return axisView
                ? Math.max(
                      axisView.getPerpendicularSize() +
                          (axisView.axisProps.offset ?? 0),
                      0
                  )
                : 0;
        };

        // Axes and overhang should be mutually exclusive, so we can just add them together
        return new Padding(
            calculate("top"),
            calculate("right"),
            calculate("bottom"),
            calculate("left")
        ).add(this.view.getOverhang());
    }

    getOverhangAndPadding() {
        return this.getOverhang().add(this.view.getPadding());
    }
}

/**
 * @param {import("../../spec/view.js").ViewBackground} viewBackground
 * @returns {import("../../spec/view.js").UnitSpec}
 */
export function createBackground(viewBackground) {
    const required =
        viewBackground?.fill ||
        viewBackground?.fillOpacity ||
        viewBackground?.shadowOpacity;
    if (!required) {
        return;
    }

    return {
        configurableVisibility: false,
        data: { values: [{}] },
        mark: {
            color: viewBackground.fill,
            opacity:
                viewBackground.fillOpacity ?? (viewBackground.fill ? 1.0 : 0.0),
            type: "rect",
            clip: false, // Shouldn't be needed
            tooltip: null,
            minHeight: 1,
            minOpacity: 0,
            shadowBlur: viewBackground.shadowBlur,
            shadowColor: viewBackground.shadowColor,
            shadowOffsetX: viewBackground.shadowOffsetX,
            shadowOffsetY: viewBackground.shadowOffsetY,
            shadowOpacity: viewBackground.shadowOpacity,
        },
    };
}

/**
 * @param {import("../../spec/view.js").ViewBackground} viewBackground
 * @returns {import("../../spec/view.js").UnitSpec}
 */
export function createBackgroundStroke(viewBackground) {
    if (
        !viewBackground ||
        !viewBackground.stroke ||
        viewBackground.strokeWidth === 0 ||
        viewBackground.strokeOpacity === 0
    ) {
        return;
    }

    // Using rules to draw a non-filled rectangle.
    // We are not using a rect mark because it is not optimized for outlines.
    // TODO: Implement "hollow" mesh for non-filled rectangles
    return {
        configurableVisibility: false,
        resolve: {
            scale: { x: "excluded", y: "excluded" },
            axis: { x: "excluded", y: "excluded" },
        },
        data: {
            values: [
                { x: 0, y: 0, x2: 1, y2: 0 },
                { x: 1, y: 0, x2: 1, y2: 1 },
                { x: 1, y: 1, x2: 0, y2: 1 },
                { x: 0, y: 1, x2: 0, y2: 0 },
            ],
        },
        mark: {
            size: viewBackground.strokeWidth ?? 1.0,
            color: viewBackground.stroke ?? "lightgray",
            strokeCap: "square",
            opacity: viewBackground.strokeOpacity ?? 1.0,
            type: "rule",
            clip: false,
            tooltip: null,
        },
        encoding: {
            x: { field: "x", type: "quantitative", scale: null },
            y: { field: "y", type: "quantitative", scale: null },
            x2: { field: "x2" },
            y2: { field: "y2" },
        },
    };
}
