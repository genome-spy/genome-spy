import { isContinuous } from "vega-scale";
import { clampRange } from "vega-util";
import { createPrimitiveEventProxy } from "../../utils/interactionEvent.js";
import { invertScalePosition } from "../../scales/scalePosition.js";
import {
    asEventConfig,
    createEventPredicate,
    getEventFilterLocation,
    validateEventType,
} from "../../utils/interactionConfig.js";
import { startPointerDrag } from "../../utils/pointerDrag.js";
import { isExprRef } from "../../paramRuntime/paramUtils.js";
import Point from "../layout/point.js";
import Rectangle from "../layout/rectangle.js";
import {
    createSelectionRectOverlay,
    INTERVAL_DRAG_ACTIVE_PARAM,
} from "./selectionRect.js";
import { normalizeIntervalForSelection } from "../../scales/selectionDomainUtils.js";
import { zoomDomainByScaleType } from "../../scales/zoomDomainUtils.js";
import {
    createIntervalSelection,
    isActiveIntervalSelection,
} from "../../selection/selection.js";
import { ViewInteractionListenerTracker } from "../viewInteractionListenerTracker.js";

/**
 * @typedef {object} IntervalSelectionHost
 * @property {import("../view.js").default} view
 * @property {import("../containerView.js").default} layoutParent
 * @property {import("../../types/viewContext.js").default} context
 * @property {{ horizontal: boolean, getScale: () => import("../../scales/legendGradientMapping.js").NormalizedPositionScale | undefined, getDomain: () => [number, number], setDragActive: (active: boolean, creating: boolean) => void }} [ramp]
 * @property {boolean} [captureInteractions]
 * @property {(point: Point) => Rectangle | undefined} getInteractionCoords
 * @property {(name: string, point: Point) => boolean} [ownsInteraction]
 * @property {(channel: import("../../spec/parameter.js").IntervalSelectionChannel, point: Point) => Rectangle} getProjectionCoords
 * @property {() => import("./selectionRect.js").SelectionRectOverlay | undefined} [getSelectionRect]
 * @property {(overlay: import("./selectionRect.js").SelectionRectOverlay) => void} [setSelectionRect]
 */

/** Handles interval selection interaction listeners for one layout host. */
export class IntervalSelectionController {
    /**
     * @param {IntervalSelectionHost} host
     * @param {string} name
     * @param {import("../../spec/parameter.js").Parameter} param
     * @param {import("../../spec/parameter.js").IntervalSelectionConfig} select
     * @param {import("../../paramRuntime/viewParamRuntime.js").default} [paramRuntime]
     * @param {boolean} [renderOverlay]
     * @param {import("./selectionRect.js").SelectionRectOverlay} [selectionRect]
     */
    constructor(
        host,
        name,
        param,
        select,
        paramRuntime = host.view.paramRuntime,
        renderOverlay = true,
        selectionRect
    ) {
        this.host = host;
        this.#viewListeners = new ViewInteractionListenerTracker(host.view);

        this.#setup(
            name,
            param,
            select,
            paramRuntime,
            renderOverlay,
            selectionRect
        );

        this.#unregisterSelectionController =
            paramRuntime.registerSelectionController(name, this);
    }

    /** @type {IntervalSelectionHost} */
    host;

    /** @type {ViewInteractionListenerTracker} */
    #viewListeners;

    /** @type {() => boolean} */
    #cancelActiveDrag = () => false;

    /** @type {(point: Point) => boolean} */
    #containsPoint = () => false;

    /** @type {() => void} */
    #unregisterSelectionController = () => {};

    /** @type {(() => void)[]} */
    #scaleDisposers = [];

    /**
     * @param {string} type
     * @param {import("../view.js").InteractionListener} listener
     * @param {boolean} [capture]
     */
    #addViewInteractionListener(
        type,
        listener,
        capture = this.host.captureInteractions
    ) {
        this.#viewListeners.add(type, listener, capture);
    }

    dispose() {
        this.#cancelActiveDrag();
        this.#unregisterSelectionController();
        this.#viewListeners.dispose();
        this.#scaleDisposers.splice(0).forEach((dispose) => dispose());
    }

    /**
     * Tests a canvas point against this controller's actual interaction host,
     * ownership, and current domain selection.
     *
     * @param {{ x: number, y: number }} point
     * @returns {boolean}
     */
    contains(point) {
        return this.#containsPoint(/** @type {Point} */ (point));
    }

    /**
     * @param {string} name
     * @param {import("../../spec/parameter.js").Parameter} param
     * @param {import("../../spec/parameter.js").IntervalSelectionConfig} select
     * @param {import("../../paramRuntime/viewParamRuntime.js").default} paramRuntime
     * @param {boolean} renderOverlay
     * @param {import("./selectionRect.js").SelectionRectOverlay | undefined} selectionRect
     */
    #setup(name, param, select, paramRuntime, renderOverlay, selectionRect) {
        const view = this.host.view;
        const channels = select.encodings ?? ["x"];
        const ramp = this.host.ramp;

        const scaleResolutions = Object.fromEntries(
            channels.map((channel) => {
                const resolution = view.getScaleResolution(channel);
                const scaleType = resolution?.getResolvedScaleType();

                if (!resolution || !scaleType || !isContinuous(scaleType)) {
                    throw new Error(
                        `No continuous scale found for interval selection param "${name}" on channel "${channel}"! Scale type is "${scaleType ?? "none"}".`
                    );
                }
                return [channel, resolution];
            })
        );
        for (const resolution of Object.values(scaleResolutions)) {
            const cancel = () => this.#cancelActiveDrag();
            if (ramp) {
                this.#scaleDisposers.push(resolution.observeMapping(cancel));
                continue;
            }
            resolution.addEventListener("domain", cancel);
            this.#scaleDisposers.push(() =>
                resolution.removeEventListener("domain", cancel)
            );
        }

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

        const { touchDrag = !eventConfig.filter && !requiresShiftToBrush } =
            select;
        const overridesPan = select.touchDrag !== undefined;
        const touchDragEnabled = isExprRef(touchDrag)
            ? paramRuntime.createExpression(touchDrag)
            : () => touchDrag;

        const source =
            "select" in param && typeof param.select === "object"
                ? param.select
                : undefined;
        const eventPredicate = createEventPredicate(
            eventConfig,
            getEventFilterLocation(paramRuntime, source, "on")
        );

        const zoomEventConfig = resolveIntervalZoomEventConfig(
            select.zoom,
            requiresShiftToBrush,
            name
        );
        const zoomEventPredicate = createEventPredicate(
            zoomEventConfig,
            getEventFilterLocation(paramRuntime, source, "zoom")
        );
        const clearEventConfig =
            /** @type {import("../../spec/parameter.js").EventConfig | undefined} */ (
                select.clear
            );
        const clearEventPredicate = createEventPredicate(
            clearEventConfig,
            getEventFilterLocation(paramRuntime, source, "clear")
        );

        const state = paramRuntime.getIntervalSelectionState(name);
        let preventNextClickPropagation = false;
        /** @type {Point | undefined} */
        let pendingClearStart;
        let dragging = false;

        const selectionExpr = paramRuntime.createExpression(name);
        const setter = (
            /** @type {import("../../types/selectionTypes.js").IntervalSelection} */
            selection
        ) => {
            if (ramp && selection.intervals[channels[0]]) {
                const component = channels[0];
                const bounds = selection.intervals[component];
                const [min, max] = ramp.getDomain();
                const visible = (/** @type {number} */ value) =>
                    Math.max(min, Math.min(max, value));
                const previous = /** @type {[number, number] | null} */ (
                    selectionExpr().intervals[component]
                );
                const scale = ramp.getScale();
                if (
                    previous &&
                    previous.every(
                        (value, index) =>
                            Math.abs(
                                scale(visible(value)) - scale(bounds[index])
                            ) < 1e-12
                    )
                )
                    return;
                if (bounds[0] < bounds[1] && bounds[1] === max)
                    bounds[1] = Infinity;
            }
            paramRuntime.setValue(name, selection, {
                intervalGesture: dragging ? this : undefined,
            });
        };

        const clearSelection = () => {
            if (isActiveIntervalSelection(selectionExpr())) {
                setter(createIntervalSelection(channels));
            }
        };

        const isInsideHost = (/** @type {Point} */ point) =>
            this.host
                .getInteractionCoords(point)
                ?.containsPoint(point.x, point.y) ?? false;
        const ownsInteraction = (/** @type {Point} */ point) =>
            this.host.ownsInteraction?.(name, point) ?? true;

        let dragOverlay = selectionRect;
        if (renderOverlay) {
            if (!this.host.getSelectionRect || !this.host.setSelectionRect) {
                throw new Error(
                    "Interval selection hosts must provide a selection rectangle."
                );
            }
            if (this.host.getSelectionRect()) {
                throw new Error(
                    "Only one interval selection per container is currently allowed!"
                );
            }
            dragOverlay = createSelectionRectOverlay({
                selectionExpr,
                selectionExpression: name,
                channels:
                    /** @type {import("../../spec/channel.js").PrimaryPositionalChannel[]} */ (
                        channels
                    ),
                brushConfig: select.mark,
                context: this.host.context,
                layoutParent: this.host.layoutParent,
                dataParent: view,
                scaleResolutionSource: view,
            });
            this.host.setSelectionRect(dragOverlay);
        }
        const setIntervalDragActive = (
            /** @type {boolean} */ translating,
            creating = false
        ) => {
            if (dragOverlay) {
                dragOverlay.view.paramRuntime.setValue(
                    INTERVAL_DRAG_ACTIVE_PARAM,
                    translating
                );
            } else {
                ramp?.setDragActive(translating, creating);
            }
        };

        const invertPoint = (
            /** @type {import("../layout/point.js").default} */ point,
            projectionCoords = this.host.getProjectionCoords(channels[0], point)
        ) => {
            /** @type {Record<string, number>} */
            const inverted = {};
            const normalizedPoint = projectionCoords.normalizePoint(
                point.x,
                point.y,
                true
            );

            if (ramp) {
                const scale = ramp.getScale();
                const position = ramp.horizontal
                    ? normalizedPoint.x
                    : normalizedPoint.y;
                const [min, max] = ramp.getDomain();
                inverted[channels[0]] =
                    position === scale(min)
                        ? min
                        : position === scale(max)
                          ? max
                          : scale.invert(position);
                return inverted;
            }
            for (const channel of channels) {
                const scale = scaleResolutions[channel].getScale();
                const position =
                    channel === "x" ? normalizedPoint.x : normalizedPoint.y;
                inverted[channel] = invertScalePosition(
                    scale,
                    position,
                    channel === "x"
                        ? projectionCoords.width
                        : projectionCoords.height
                );
            }

            return inverted;
        };

        /**
         * Converts the current selection intervals (in scale domain) to a rectangle
         * in screen coordinates.
         * @param {import("../../types/selectionTypes.js").IntervalSelection} selection
         * @param {Rectangle} projectionCoords
         */
        const selectionToRect = (selection, projectionCoords) => {
            if (ramp) {
                const bounds = selection.intervals[channels[0]];
                const [min, max] = ramp.getDomain();
                const scale = ramp.getScale();
                const a = scale(Math.max(min, Math.min(max, bounds[0])));
                const b = scale(Math.max(min, Math.min(max, bounds[1])));
                return ramp.horizontal
                    ? Rectangle.create(
                          projectionCoords.x +
                              Math.min(a, b) * projectionCoords.width,
                          projectionCoords.y,
                          Math.abs(a - b) * projectionCoords.width,
                          projectionCoords.height
                      )
                    : Rectangle.create(
                          projectionCoords.x,
                          projectionCoords.y +
                              (1 - Math.max(a, b)) * projectionCoords.height,
                          projectionCoords.width,
                          Math.abs(a - b) * projectionCoords.height
                      );
            }
            const { intervals } = selection;

            const mapCorner = (/** @type {number} */ i) => {
                const getCoord = (
                    /** @type {import("../../spec/parameter.js").IntervalSelectionChannel} */ channel
                ) => {
                    const value = intervals[channel]?.[i];
                    if (value == null) return i;
                    const scale = scaleResolutions[channel].getScale();
                    if (scale.type === "index" || scale.type === "locus") {
                        const mapping =
                            /** @type {import("../../genome/scaleIndex.js").ScaleIndex} */ (
                                scale
                            ).gapMapping(
                                channel === "x"
                                    ? projectionCoords.width
                                    : projectionCoords.height
                            );
                        if (mapping)
                            return mapping.position(
                                value,
                                0,
                                i === 1 && value > intervals[channel][0]
                            );
                    }
                    return scale(value);
                };
                return projectionCoords.denormalizePoint(
                    getCoord("x"),
                    getCoord("y"),
                    true
                );
            };

            const a = mapCorner(0);
            const b = mapCorner(1);

            return Rectangle.create(
                Math.min(a.x, b.x),
                Math.min(a.y, b.y),
                Math.abs(b.x - a.x),
                Math.abs(b.y - a.y)
            );
        };

        const selectionRectAt = (/** @type {Point} */ point) => {
            const selection = selectionExpr();
            if (!isActiveIntervalSelection(selection)) return null;
            if (ramp && !ramp.getScale()) return null;
            if (
                Object.values(selection.intervals).some(
                    (interval) => interval && interval[0] === interval[1]
                )
            )
                return null;
            const rectangle = selectionToRect(
                selection,
                this.host.getProjectionCoords(channels[0], point)
            );
            return rectangle.containsPoint(point.x, point.y) ? rectangle : null;
        };

        /** @param {import("../../utils/interaction.js").default} event */
        const canStartDrag = (event) =>
            event.mouseEvent.button === 0 &&
            isInsideHost(event.point) &&
            ownsInteraction(event.point) &&
            (!ramp || !!ramp.getScale());

        /**
         * @param {import("../../utils/interaction.js").default} event
         * @param {PointerEvent} [touchEvent]
         */
        const startDrag = (event, touchEvent) => {
            const selection = selectionExpr();
            const start = event.point;
            const projectionCoords = this.host.getProjectionCoords(
                channels[0],
                start
            );
            pendingClearStart = undefined;
            // Keep translation geometry in screen coordinates because scales
            // may be nonlinear.
            const translatedRectangle = selectionRectAt(start);

            if (!touchEvent) {
                const hasSelection = isActiveIntervalSelection(selection);
                // Let the first click on or outside a brush belong to that brush.
                if (hasSelection) preventNextClickPropagation = true;
                if (
                    !translatedRectangle &&
                    !eventPredicate(event.proxiedMouseEvent)
                ) {
                    // If mouse button is released and there was a selection,
                    // it should be cleared unless the viewport was panned by dragging.
                    if (clearEventConfig && hasSelection) {
                        pendingClearStart = start;
                    }
                    return;
                }
            }

            // Prevent panning interaction
            event.stopPropagation();

            state.begin(this, () => this.#cancelActiveDrag());
            dragging = true;
            setIntervalDragActive(!!translatedRectangle, !translatedRectangle);
            if (!touchEvent && !translatedRectangle) {
                clearSelection();
            }

            const viewOffset = Point.fromMouseEvent(event.mouseEvent).subtract(
                start
            );

            const onMove = (/** @type {PointerEvent} */ event) => {
                let startPoint = start;
                let endPoint = Point.fromMouseEvent(event).subtract(viewOffset);

                if (translatedRectangle) {
                    const offset = endPoint.subtract(start);
                    const rect = translatedRectangle.translate(
                        offset.x,
                        offset.y
                    );
                    startPoint = new Point(rect.x, rect.y);
                    endPoint = new Point(rect.x2, rect.y2);
                }

                const startValues = invertPoint(startPoint, projectionCoords);
                const endValues = invertPoint(endPoint, projectionCoords);
                /** @type {import("../../types/selectionTypes.js").IntervalSelection["intervals"]} */
                const intervals = {};
                for (const channel of channels) {
                    const scaleResolution = scaleResolutions[channel];
                    const zoomExtent = ramp
                        ? ramp.getDomain()
                        : scaleResolution.zoomExtent;
                    const a = startValues[channel];
                    const b = endValues[channel];
                    // Keep a lower bound of -0 when ordering the endpoints.
                    const bounds = [Math.min(a, b), Math.max(a, b)];
                    // Translation preserves the domain span before clipping and rounding.
                    const interval = translatedRectangle
                        ? clampRange(bounds, zoomExtent[0], zoomExtent[1])
                        : bounds;
                    const normalized = ramp
                        ? normalizeIntervalForSelection(interval, zoomExtent)
                        : normalizeIntervalForChannel(
                              scaleResolution,
                              interval
                          );
                    intervals[channel] = normalized ?? [
                        zoomExtent[0],
                        zoomExtent[0],
                    ];
                }

                setter({ type: "interval", intervals });
            };

            this.#cancelActiveDrag = startPointerDrag(
                touchEvent ?? event.mouseEvent,
                {
                    onMove,
                    capture: !touchEvent,
                    hoverContext: touchEvent ? undefined : view.context,
                    onFinish: (released) => {
                        dragging = false;
                        setIntervalDragActive(false);
                        if (!released) {
                            preventNextClickPropagation = false;
                            state.finish(this, false);
                        }
                    },
                    onRelease: () => state.finish(this, true),
                }
            );
            if (touchEvent) onMove(touchEvent);
            return this.#cancelActiveDrag;
        };
        this.#addViewInteractionListener("mousedown", (event) => {
            if (canStartDrag(event)) startDrag(event);
        });
        if (touchDrag) {
            this.#addViewInteractionListener("touchdragstart", (event) => {
                const drag = event.uiEvent;
                if (
                    "activeEvent" in drag &&
                    !event.stopped &&
                    (!drag.brush ||
                        (overridesPan && !drag.brush.overridesPan)) &&
                    touchDragEnabled() &&
                    canStartDrag(event)
                ) {
                    drag.brush = {
                        start: () => startDrag(event, drag.activeEvent),
                        overridesPan,
                    };
                }
            });
            if (
                clearEventConfig?.type === "dblclick" &&
                !clearEventConfig.filter
            ) {
                this.#addViewInteractionListener("touchtap", (event) => {
                    if (
                        touchDragEnabled() &&
                        isInsideHost(event.point) &&
                        ownsInteraction(event.point) &&
                        !selectionRectAt(event.point)
                    ) {
                        state.clear();
                    }
                });
            }
        }

        this.#viewListeners.add("mouseup", (event) => {
            if (!pendingClearStart) {
                return;
            }

            const mouseDownPoint = pendingClearStart;
            pendingClearStart = undefined;

            // Retain the selection if the viewport was panned by dragging.
            if (mouseDownPoint.subtract(event.point).length < 2) {
                clearSelection();
            }
        });

        this.#addViewInteractionListener(
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

        this.#containsPoint = (point) =>
            isInsideHost(point) &&
            ownsInteraction(point) &&
            !!selectionRectAt(point);

        if (clearEventConfig) {
            /** @param {import("../../utils/interaction.js").default} event */
            const canClear = (event) =>
                clearEventPredicate(event.proxiedMouseEvent) &&
                (ramp
                    ? isInsideHost(event.point)
                    : this.#containsPoint(event.point));

            if (clearEventConfig.type === "wheel") {
                this.#addViewInteractionListener(
                    "wheelclaimprobe",
                    (event) => {
                        if (event.wheelIntent !== "scroll" && canClear(event)) {
                            event.claimWheel(this, { smooth: false });
                            event.stopPropagation();
                        }
                    },
                    true
                );
            }

            this.#addViewInteractionListener(
                clearEventConfig.type,
                (event) => {
                    if (canClear(event)) {
                        state.clear();
                        event.stopPropagation();
                    }
                },
                true
            );
        }

        /** @param {import("../../utils/interaction.js").default} event */
        const canWheelZoom = (event) => {
            if (event.wheelIntent === "scroll") {
                return false;
            }
            const wheelEvent = event.wheelEvent;
            return (
                !!zoomEventConfig &&
                zoomEventPredicate(createPrimitiveEventProxy(wheelEvent)) &&
                this.#containsPoint(event.point) &&
                wheelEvent.deltaY !== 0 &&
                Math.abs(wheelEvent.deltaX) <= Math.abs(wheelEvent.deltaY)
            );
        };

        this.#addViewInteractionListener("wheelclaimprobe", (event) => {
            if (canWheelZoom(event)) {
                event.claimWheel(this, { smooth: false });
                event.stopPropagation();
            }
        });

        this.#addViewInteractionListener("wheel", (event) => {
            if (!canWheelZoom(event)) {
                return;
            }
            const wheelEvent = event.wheelEvent;
            const selection = selectionExpr();

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
                const extent = ramp?.getDomain();
                const visibleInterval = extent
                    ? currentInterval.map((/** @type {number} */ v) =>
                          Math.max(extent[0], Math.min(extent[1], v))
                      )
                    : currentInterval;
                const zoomed = zoomDomainByScaleType(
                    scale,
                    /** @type {[number, number]} */ ([...visibleInterval]),
                    anchor[channel],
                    scaleFactor,
                    { onUnsupported: "identity" }
                );

                const normalized = extent
                    ? normalizeIntervalForSelection(zoomed, extent)
                    : normalizeIntervalForChannel(scaleResolution, zoomed);
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
    validateEventType(
        eventConfig,
        ["wheel"],
        `Interval selection param "${paramName}" currently supports only "wheel" in "zoom".`
    );

    return eventConfig;
}

/**
 * @param {import("../../scales/scaleResolution.js").default} scaleResolution
 * @param {number[]} interval
 * @returns {[number, number] | undefined}
 */
function normalizeIntervalForChannel(scaleResolution, interval) {
    const scale = scaleResolution.getScale();
    return normalizeIntervalForSelection(interval, scaleResolution.zoomExtent, {
        roundToIntegers: scale.type === "index" || scale.type === "locus",
    });
}
