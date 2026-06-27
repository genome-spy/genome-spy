import { isContinuous } from "vega-scale";
import { isRulerParameter } from "../../paramRuntime/paramUtils.js";
import {
    asEventConfig,
    asSelectionConfig,
    createIntervalSelection,
    isActiveIntervalSelection,
    isIntervalSelectionConfig,
    selectionContainsPoint,
} from "../../selection/selection.js";
import { createPrimitiveEventProxy } from "../../utils/interactionEvent.js";
import AxisGridView from "../axisGridView.js";
import AxisView, {
    CHANNEL_ORIENTS,
    getExternalAxisOverhang,
} from "../axisView.js";
import LayerView from "../layerView.js";
import Padding from "../layout/padding.js";
import Point from "../layout/point.js";
import Rectangle from "../layout/rectangle.js";
import TitleView from "../titleView.js";
import UnitView from "../unitView.js";
import {
    isChromeView,
    markViewAsChrome,
    markViewAsNonAddressable,
} from "../viewSelectors.js";
import Scrollbar from "./scrollbar.js";
import SelectionRect, { INTERVAL_DRAG_ACTIVE_PARAM } from "./selectionRect.js";
import { normalizeIntervalForSelection } from "../../scales/selectionDomainUtils.js";
import { zoomDomainByScaleType } from "../../scales/zoomDomainUtils.js";
import { createEventFilterFunction } from "../../utils/expression.js";
import { getConfiguredViewBackground } from "../../config/viewConfig.js";
import { getConfiguredAxisDefaults } from "../../config/axisConfig.js";
import {
    addLegendView,
    createGridChildLegend,
    disposeLegendViews,
    getLegendOverhang,
    getOrderedLegendEntries,
    iterateLegendViews,
} from "./gridChildLegends.js";
import { RulerMouseEventController } from "../../ruler/rulerMouseEventController.js";

/**
 * @typedef {{
 *     axisView: AxisView,
 *     channel: import("../../spec/channel.js").PrimaryPositionalChannel,
 *     orient: import("../../spec/axis.js").AxisOrient,
 *     resolution: import("../../scales/axisResolution.js").default,
 * }} AxisCandidate
 */

/**
 * @param {import("../view.js").default} view
 * @returns {import("../view.js").default[]}
 */
function getLegendOwners(view) {
    if (isChromeView(view) || view.getLayoutAncestors().some(isChromeView)) {
        return [];
    } else if (view instanceof UnitView) {
        return Object.keys(view.resolutions.legend).length > 0 ? [view] : [];
    } else if (view instanceof LayerView) {
        return [
            ...(Object.keys(view.resolutions.legend).length > 0 ? [view] : []),
            ...Array.from(view).flatMap((child) => getLegendOwners(child)),
        ];
    } else {
        return [];
    }
}

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

        /** @type {AxisCandidate[]} */
        this.axisCandidates = [];

        /** @type {Partial<Record<import("../../spec/axis.js").AxisOrient, AxisGridView>>} gridLines */
        this.gridLines = {};

        /** @type {import("./gridChildLegends.js").GridChildLegends} */
        this.legends = {};

        /** @type {Partial<Record<import("./scrollbar.js").ScrollDirection, Scrollbar>>} */
        this.scrollbars = {};

        /** @type {SelectionRect} */
        this.selectionRect = undefined;

        /** @type {RulerMouseEventController[]} */
        this.rulerMouseEventControllers = [];

        /** @type {TitleView} */
        this.title = undefined;

        /** @type {number} */
        this.backgroundZindex = 0;

        /** @type {number | undefined} */
        this.backgroundStrokeZindex = undefined;

        /** @type {Rectangle} */
        this.coords = Rectangle.ZERO;

        const needsAxes = view.needsAxes.x || view.needsAxes.y;
        const parentChromePolicy = view.getParentGridChromePolicy();
        const spec = view.spec;
        const explicitViewBackground = "view" in spec ? spec.view : undefined;

        if (
            parentChromePolicy.background &&
            (needsAxes || explicitViewBackground)
        ) {
            const viewBackground = getConfiguredViewBackground(
                view.getConfigScopes(),
                explicitViewBackground
            );
            this.backgroundZindex = viewBackground?.zindex ?? 0;
            this.backgroundStrokeZindex = viewBackground?.strokeZindex;

            const backgroundSpec = createBackground(viewBackground);
            if (backgroundSpec) {
                this.background = new UnitView(
                    backgroundSpec,
                    layoutParent.context,
                    layoutParent,
                    view,
                    "background" + serial
                );
                markViewAsNonAddressable(this.background, {
                    skipSubtree: true,
                });
                markViewAsChrome(this.background, { skipSubtree: true });
            }

            const backgroundStrokeSpec = createBackgroundStroke(viewBackground);
            if (backgroundStrokeSpec) {
                this.backgroundStroke = new UnitView(
                    backgroundStrokeSpec,
                    layoutParent.context,
                    layoutParent,
                    view,
                    "backgroundStroke" + serial
                );
                markViewAsNonAddressable(this.backgroundStroke, {
                    skipSubtree: true,
                });
                markViewAsChrome(this.backgroundStroke, {
                    skipSubtree: true,
                });
            }
        }

        this.title = view.spec.title
            ? TitleView.create(
                  view.spec.title,
                  view.getConfigScopes(),
                  layoutParent.context,
                  layoutParent,
                  view,
                  "title" + serial
              )
            : undefined;

        // TODO: More specific getter for this
        if (view.spec.viewportWidth != null) {
            this.scrollbars.horizontal = new Scrollbar(this, "horizontal");
        }

        if (view.spec.viewportHeight != null) {
            this.scrollbars.vertical = new Scrollbar(this, "vertical");
        }

        this.#setupIntervalSelection();
        this.#setupPointerRulers();
    }

    #setupPointerRulers() {
        const view = this.view;

        for (const [name, param] of view.paramRuntime.paramConfigs) {
            if (!isRulerParameter(param)) {
                continue;
            }

            const ruler = param.ruler;
            if (ruler.source === "viewport") {
                continue;
            }

            const channels = ruler.encodings ?? ["x"];
            const scaleResolutions = Object.fromEntries(
                channels.map((channel) => {
                    const resolution = view.getScaleResolution(channel);

                    if (!resolution?.getResolvedScaleType?.()) {
                        throw new Error(
                            `No scale found for ruler param "${name}" on channel "${channel}".`
                        );
                    }

                    return [channel, resolution];
                })
            );

            this.rulerMouseEventControllers.push(
                new RulerMouseEventController(
                    this,
                    name,
                    ruler,
                    channels,
                    scaleResolutions
                )
            );
        }
    }

    #setupIntervalSelection() {
        const view = this.view;

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
                    const scaleType = resolution?.getResolvedScaleType();

                    if (!resolution || !scaleType || !isContinuous(scaleType)) {
                        throw new Error(
                            `No continuous scale found for interval selection param "${name}" on channel "${channel}"! Scale type is "${scaleType ?? "none"}".`
                        );
                    }
                    return [channel, resolution];
                })
            );

            const requiresShiftToBrush = channels.some((channel) =>
                scaleResolutions[channel].isZoomable()
            );

            const eventConfig =
                /** @type {import("../../spec/parameter.js").EventConfig} */ (
                    select.on ??
                        (requiresShiftToBrush
                            ? {
                                  type: "mousedown",
                                  filter: "event.shiftKey",
                              }
                            : {
                                  type: "mousedown",
                              })
                );

            if (eventConfig.type !== "mousedown") {
                throw new Error(
                    `Interval selection param "${name}" currently supports only "mousedown" in "on".`
                );
            }

            const eventPredicate = eventConfig.filter
                ? createEventFilterFunction(eventConfig.filter)
                : () => true;

            const zoomEventConfig = resolveIntervalZoomEventConfig(
                select.zoom,
                requiresShiftToBrush,
                name
            );
            const zoomEventPredicate = zoomEventConfig?.filter
                ? createEventFilterFunction(zoomEventConfig.filter)
                : () => true;

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
            };

            this.selectionRect = new SelectionRect(
                this,
                selectionExpr,
                select.mark
            );
            const setIntervalDragActive = (/** @type {boolean} */ active) => {
                this.selectionRect.paramRuntime.setValue(
                    INTERVAL_DRAG_ACTIVE_PARAM,
                    active
                );
            };

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

            view.addInteractionListener("mousedown", (event) => {
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
                    setIntervalDragActive(true);
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

                    const startSelection = eventPredicate(
                        event.proxiedMouseEvent
                    );

                    if (startSelection) {
                        clearSelection();
                        nowBrushing = true;
                    } else if (isActiveIntervalSelection(selectionExpr())) {
                        // If mouse button is released and there was a selection,
                        // it should be cleared unless the viewport was panned by dragging.
                        /** @type {import("../view.js").InteractionListener} */
                        const listener = (event) => {
                            view.removeInteractionListener("mouseup", listener);
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
                        view.addInteractionListener("mouseup", listener);
                        return;
                    } else {
                        return;
                    }
                }

                // Prevent panning interaction
                event.stopPropagation();
                view.context.suspendHoverTracking();

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
                        const { zoomExtent } = scaleResolution;
                        const interval = intervals[channel];

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
                        }

                        const normalized = normalizeIntervalForChannel(
                            scaleResolution,
                            interval
                        );

                        if (!normalized) {
                            interval[0] = zoomExtent[0];
                            interval[1] = zoomExtent[0];
                        } else {
                            interval[0] = normalized[0];
                            interval[1] = normalized[1];
                        }
                    }

                    setter({ type: "interval", intervals });
                };

                const mouseUpListener = (/** @type {MouseEvent} */ upEvent) => {
                    document.removeEventListener(
                        "mousemove",
                        mouseMoveListener
                    );
                    document.removeEventListener("mouseup", mouseUpListener);

                    setIntervalDragActive(false);
                    nowBrushing = false;
                    if (translatedRectangle) {
                        translatedRectangle = null;
                    }
                    view.context.resumeHoverTracking(upEvent);
                };
                document.addEventListener("mousemove", mouseMoveListener);

                document.addEventListener("mouseup", mouseUpListener);
            });

            view.addInteractionListener(
                "click",
                (event) => {
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
            view.addInteractionListener(
                "dblclick",
                (event) => {
                    if (isPointInsideSelection(event.point)) {
                        clearSelection();
                        event.stopPropagation();
                    }
                },
                true
            );

            view.addInteractionListener("wheel", (event) => {
                const wheelEvent = event.wheelEvent;

                if (
                    !zoomEventConfig ||
                    !zoomEventPredicate(createPrimitiveEventProxy(wheelEvent))
                ) {
                    return;
                }

                if (
                    Math.abs(wheelEvent.deltaX) >= Math.abs(wheelEvent.deltaY)
                ) {
                    return;
                }
                if (!isPointInsideSelection(event.point)) {
                    return;
                }

                const selection = selectionExpr();
                if (!isActiveIntervalSelection(selection)) {
                    return;
                }

                const wheelMultiplier = wheelEvent.deltaMode ? 120 : 1;
                const scaleFactor =
                    2 ** ((wheelEvent.deltaY * wheelMultiplier) / 300);

                const anchor = invertPoint(event.point);
                /** @type {typeof selection.intervals} */
                const intervals = { ...selection.intervals };
                let changed = false;

                for (const channel of channels) {
                    const currentInterval = intervals[channel];
                    if (!currentInterval || currentInterval.length !== 2) {
                        continue;
                    }

                    const scaleResolution = scaleResolutions[channel];
                    const scale = scaleResolution.getScale();
                    const zoomed = zoomDomainByScaleType(
                        scale,
                        /** @type {[number, number]} */ ([...currentInterval]),
                        anchor[channel],
                        scaleFactor,
                        { onUnsupported: "identity" }
                    );

                    const normalized = normalizeIntervalForChannel(
                        scaleResolution,
                        zoomed
                    );
                    if (!normalized) {
                        continue;
                    }

                    if (
                        normalized[0] !== currentInterval[0] ||
                        normalized[1] !== currentInterval[1]
                    ) {
                        intervals[channel] = normalized;
                        changed = true;
                    }
                }

                if (changed) {
                    setter({
                        ...selection,
                        type: "interval",
                        intervals,
                    });
                    wheelEvent.preventDefault();
                    event.stopPropagation();
                }
            });

            // Handle mouse cursor changes
            view.addInteractionListener("mousemove", (event) => {
                if (isPointInsideSelection(event.point)) {
                    // Brushing and translating the existing brush are different actions.
                    if (!nowBrushing) {
                        mouseOver = true;
                    }
                } else {
                    mouseOver = false;
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
        for (const candidate of this.axisCandidates) {
            yield candidate.axisView;
        }
        yield* iterateLegendViews(this.legends);
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
        const parentChromePolicy = view.getParentGridChromePolicy();
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
                if (axes[props.orient] && !this.allowDuplicateAxes()) {
                    throw new Error(
                        `An axis with the orient "${props.orient}" already exists!`
                    );
                }

                const axisView = new AxisView(
                    props,
                    r.scaleResolution.type,
                    this.layoutParent.context,
                    this.layoutParent,
                    axisParent,
                    {
                        labelClipPolicy: this.getAxisLabelClipPolicy(
                            channel,
                            view
                        ),
                    }
                );
                axes[props.orient] ??= axisView;
                this.axisCandidates.push({
                    axisView,
                    channel,
                    orient: props.orient,
                    resolution: r,
                });
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
            if (!props) {
                return;
            }

            const defaults = getConfiguredAxisDefaults(
                axisParent.getConfigScopes(),
                {
                    channel,
                    orient: props.orient,
                    type: /** @type {import("../../spec/channel.js").Type} */ (
                        r.scaleResolution.type
                    ),
                    style: props.style,
                }
            );
            const effectiveProps = {
                ...defaults,
                ...props,
            };

            if (effectiveProps.grid || effectiveProps.chromGrid) {
                const axisGridView = new AxisGridView(
                    effectiveProps,
                    r.scaleResolution.type,
                    this.layoutParent.context,
                    this.layoutParent,
                    axisParent
                );
                gridLines[props.orient] = axisGridView;
                await axisGridView.initializeChildren();
            }
        };

        if (parentChromePolicy.axes) {
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
        }

        for (const { definition, resolution } of getOrderedLegendEntries(
            getLegendOwners(view)
        )) {
            const legend = await createGridChildLegend(
                definition,
                this.layoutParent
            );
            await addLegendView(this.legends, legend, resolution);
        }

        // Axes are created after scales are resolved, so we need to resolve possible new scales here
        [
            ...this.axisCandidates.map((candidate) => candidate.axisView),
            ...Object.values(gridLines),
            ...iterateLegendViews(this.legends),
        ].forEach((v) =>
            v.visit((view) => {
                if (view instanceof UnitView) {
                    view.resolve("scale");
                }
            })
        );
    }

    /**
     * Allows subclasses such as SampleGridChild to keep multiple same-orient
     * axis candidates. Ordinary GridView behavior still rejects duplicates.
     *
     * @protected
     * @returns {boolean}
     */
    allowDuplicateAxes() {
        return false;
    }

    /**
     * @param {import("../../spec/axis.js").AxisOrient} orient
     * @returns {AxisCandidate | undefined}
     */
    getActiveAxisCandidate(orient) {
        // Later candidates win, matching the existing layer draw order.
        return this.getActiveAxisCandidates(orient).at(-1);
    }

    /**
     * @param {import("../../spec/axis.js").AxisOrient} orient
     * @returns {AxisCandidate[]}
     */
    getActiveAxisCandidates(orient) {
        return this.axisCandidates.filter(
            (candidate) =>
                candidate.orient === orient &&
                candidate.resolution.hasVisibleNonChromeMember()
        );
    }

    /**
     * Disposes axis and gridline views so axes can be recreated safely.
     */
    disposeAxisViews() {
        for (const candidate of this.axisCandidates) {
            candidate.axisView.disposeSubtree();
        }

        for (const gridView of Object.values(this.gridLines)) {
            gridView.disposeSubtree();
        }

        disposeLegendViews(this.legends);

        this.axes = {};
        this.axisCandidates = [];
        this.gridLines = {};
        this.legends = {};
    }

    /**
     * @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel
     * @param {import("../view.js").default} view
     * @returns {import("../axisView.js").AxisLabelClipPolicy}
     */
    getAxisLabelClipPolicy(channel, view) {
        const configuredPolicy = view.options.axisLabelClipPolicy?.[channel];
        if (configuredPolicy) {
            return configuredPolicy;
        }

        return (channel === "x" &&
            (view.spec.viewportWidth != null ||
                this.layoutParent.spec.viewportWidth != null)) ||
            (channel === "y" &&
                (view.spec.viewportHeight != null ||
                    this.layoutParent.spec.viewportHeight != null))
            ? "anchor"
            : "pixel";
    }

    getOverhang() {
        // Axes and overhang should be mutually exclusive, so we can just add them together
        return this.getGuideOverhang()
            .add(this.getTitleOverhang())
            .add(this.view.getOverhang());
    }

    getGuideOverhang() {
        const calculate = (
            /** @type {import("../../spec/axis.js").AxisOrient} */ orient
        ) => getExternalAxisOverhang(this.axes[orient]);
        const legend = (
            /** @type {import("../../spec/legend.js").LegendOrient} */ orient
        ) => getLegendOverhang(this.legends, orient);

        return new Padding(
            calculate("top") + legend("top"),
            calculate("right") + legend("right"),
            calculate("bottom") + legend("bottom"),
            calculate("left") + legend("left")
        );
    }

    getTitleOverhang() {
        return this.title?.getOverhang() ?? Padding.zero();
    }

    getTitleZindex() {
        return this.title?.titleSpec.zindex ?? 1;
    }

    /**
     * @param {import("../renderingContext/viewRenderingContext.js").default} context
     * @param {Rectangle} viewportCoords
     * @param {import("../../types/rendering.js").RenderingOptions} options
     */
    renderTitle(context, viewportCoords, options) {
        this.title?.render(
            context,
            this.getTitleCoords(viewportCoords),
            options
        );
    }

    /**
     * Returns the frame used for rendering a view title. Reserved titles are
     * placed outside guide overhang orthogonally, while the title frame controls
     * the parallel anchor range.
     *
     * @param {Rectangle} viewportCoords
     */
    getTitleCoords(viewportCoords) {
        const titleSpec = this.title?.titleSpec;
        if (!titleSpec) {
            return viewportCoords;
        }

        const guideCoords = viewportCoords.expand(this.getGuideOverhang());
        const frame = titleSpec.frame ?? "group";
        if (titleSpec.reserve === false) {
            return frame == "bounds" ? guideCoords : viewportCoords;
        } else if (frame == "bounds") {
            return guideCoords;
        }

        switch (titleSpec.orient) {
            case "top":
            case "bottom":
                return guideCoords.modify({
                    x: () => viewportCoords.x,
                    width: () => viewportCoords.width,
                });
            case "left":
            case "right":
                return guideCoords.modify({
                    y: () => viewportCoords.y,
                    height: () => viewportCoords.height,
                });
            default:
                return viewportCoords;
        }
    }

    getOverhangAndPadding() {
        return this.getOverhang().add(this.view.getPadding());
    }
}

/**
 * @param {import("../../spec/parameter.js").IntervalSelectionConfig["zoom"]} zoom
 * @param {boolean} hasZoomableChannel
 * @param {string} paramName
 * @returns {import("../../spec/parameter.js").EventConfig | undefined}
 */
export function resolveIntervalZoomEventConfig(
    zoom,
    hasZoomableChannel,
    paramName
) {
    const defaultEnabled = !hasZoomableChannel;
    const resolved = zoom === undefined ? defaultEnabled : zoom;
    if (resolved === false) {
        return;
    }

    if (resolved === true) {
        return { type: "wheel" };
    }

    const eventConfig = asEventConfig(resolved);
    if (eventConfig.type !== "wheel") {
        throw new Error(
            `Interval selection param "${paramName}" currently supports only "wheel" in "zoom".`
        );
    }

    return eventConfig;
}

/**
 * @param {import("../../scales/scaleResolution.js").default} scaleResolution
 * @param {[number, number]} interval
 * @returns {[number, number] | undefined}
 */
function normalizeIntervalForChannel(scaleResolution, interval) {
    const scale = scaleResolution.getScale();
    return normalizeIntervalForSelection(interval, scaleResolution.zoomExtent, {
        roundToIntegers: scale.type === "index" || scale.type === "locus",
    });
}

/**
 * @param {import("../../spec/view.js").ViewBackground} viewBackground
 * @returns {import("../../spec/view.js").UnitSpec}
 */
export function createBackground(viewBackground) {
    const fillOpacity =
        viewBackground?.fillOpacity ?? (viewBackground?.fill ? 1.0 : 0.0);
    const shadowOpacity = viewBackground?.shadowOpacity ?? 0.0;
    const required =
        (viewBackground?.fill && fillOpacity !== 0) || shadowOpacity !== 0;
    if (!required) {
        return;
    }

    return {
        data: { values: [{}] },
        mark: {
            color: viewBackground.fill,
            opacity: fillOpacity,
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
            clip: "never",
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
