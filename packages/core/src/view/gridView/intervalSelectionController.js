import { isContinuous } from "vega-scale";
import { clampRange } from "vega-util";
import { createPrimitiveEventProxy } from "../../utils/interactionEvent.js";
import { invertScalePosition } from "../../scales/scalePosition.js";
import {
    createEventPredicate,
    getEventFilterLocation,
} from "../../utils/interactionConfig.js";
import { startDocumentDrag } from "../../utils/documentDrag.js";
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
import {
    asEventConfig,
    validateEventType,
} from "../../utils/interactionConfig.js";
import { ViewInteractionListenerTracker } from "../viewInteractionListenerTracker.js";

/**
 * @typedef {object} IntervalSelectionHost
 * @property {import("../view.js").default} view
 * @property {import("../containerView.js").default} layoutParent
 * @property {import("../../types/viewContext.js").default} context
 * @property {{ horizontal: boolean, getScale: () => import("../../scales/legendGradientMapping.js").NormalizedPositionScale, getDomain: () => [number, number], setDragActive: (active: boolean, creating: boolean) => void }} [ramp]
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
        this.#selectionName = name;
        this.#selectionRuntime = paramRuntime;
        this.#viewListeners = new ViewInteractionListenerTracker(host.view);

        this.#setup(
            name,
            param,
            select,
            paramRuntime,
            renderOverlay,
            selectionRect
        );

        paramRuntime.getIntervalSelectionState(name);
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

    /** @type {string} */
    #selectionName;

    /** @type {import("../../paramRuntime/viewParamRuntime.js").default} */
    #selectionRuntime;

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
     * Cancels an active gesture and clears a changed selection.
     */
    clear() {
        this.#selectionRuntime
            .getIntervalSelectionState(this.#selectionName)
            .clear();
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

        // --- Validation and early exits done ---

        let preventNextClickPropagation = false;
        /** @type {Point | undefined} */
        let pendingClearStart;
        /**
         * @type {{ start: Point, translatedRectangle: Rectangle | null } | null}
         */
        let activeBrush = null;

        /**
         * @param {Record<string, number>} a
         * @param {Record<string, number>} b
         * @return {Partial<Record<import("../../spec/parameter.js").IntervalSelectionChannel, [number, number]>>}
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
                const previous = selectionExpr().intervals[component];
                if (
                    previous &&
                    visible(previous[0]) === bounds[0] &&
                    visible(previous[1]) === bounds[1]
                )
                    return;
                if (bounds[0] < bounds[1] && bounds[1] === max)
                    bounds[1] = Infinity;
            }
            paramRuntime.setValue(name, selection, {
                intervalGesture: activeBrush ? this : undefined,
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
        const setIntervalDragActive = dragOverlay
            ? (/** @type {boolean} */ active) => {
                  dragOverlay.view.paramRuntime.setValue(
                      INTERVAL_DRAG_ACTIVE_PARAM,
                      active
                  );
              }
            : (/** @type {boolean} */ active) =>
                  ramp?.setDragActive(
                      active,
                      !!activeBrush && !activeBrush.translatedRectangle
                  );

        const invertPoint = (
            /** @type {import("../layout/point.js").default} */ point,
            projectionCoords = this.host.getProjectionCoords(channels[0], point)
        ) => {
            const inverted = /** @type {Record<string, number>} */ ({
                x: 0,
                y: 0,
            });
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
                    if ("gapMapping" in scale) {
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

        this.#addViewInteractionListener("mousedown", (event) => {
            if (
                event.mouseEvent.button != 0 ||
                !isInsideHost(event.point) ||
                !ownsInteraction(event.point)
            ) {
                return;
            }

            const selection = selectionExpr();
            const projectionCoords = this.host.getProjectionCoords(
                channels[0],
                event.point
            );
            pendingClearStart = undefined;
            // Keep translation geometry in screen coordinates because scales
            // may be nonlinear.
            const translatedRectangle = selectionRectAt(event.point);

            if (translatedRectangle) {
                // Started dragging an existing selection
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

                const startSelection = eventPredicate(event.proxiedMouseEvent);

                if (!startSelection) {
                    if (
                        !clearEventConfig ||
                        !isActiveIntervalSelection(selection)
                    ) {
                        return;
                    }

                    // If mouse button is released and there was a selection,
                    // it should be cleared unless the viewport was panned by dragging.
                    pendingClearStart = mouseDownPoint;
                    return;
                }
            }

            // Prevent panning interaction
            event.stopPropagation();

            const brush = { start: event.point, translatedRectangle };
            activeBrush = brush;
            paramRuntime
                .getIntervalSelectionState(name)
                .begin(this, () => this.#cancelActiveDrag());
            setIntervalDragActive(Boolean(translatedRectangle));
            if (!translatedRectangle) {
                clearSelection();
            }

            const viewOffset = Point.fromMouseEvent(event.mouseEvent).subtract(
                brush.start
            );

            const mouseMoveListener = (/** @type {MouseEvent} */ event) => {
                // This listener is added to the document so that events are captured even if the mouse leaves the view.
                // Thus, coordinates need to be adjusted to the view's coordinate system.
                const current =
                    Point.fromMouseEvent(event).subtract(viewOffset);

                /** @type {ReturnType<typeof pointsToIntervals>} */
                let intervals;

                if (brush.translatedRectangle) {
                    const offset = current.subtract(brush.start);
                    const newRect = brush.translatedRectangle.translate(
                        offset.x,
                        offset.y
                    );

                    intervals = pointsToIntervals(
                        invertPoint(
                            new Point(newRect.x, newRect.y),
                            projectionCoords
                        ),
                        invertPoint(
                            new Point(newRect.x2, newRect.y2),
                            projectionCoords
                        )
                    );
                } else {
                    intervals = pointsToIntervals(
                        invertPoint(brush.start, projectionCoords),
                        invertPoint(current, projectionCoords)
                    );
                }

                for (const channel of channels) {
                    const scaleResolution = scaleResolutions[channel];
                    const zoomExtent = ramp
                        ? ramp.getDomain()
                        : scaleResolution.zoomExtent;
                    // Translation preserves span before normalization clips and rounds.
                    // As before, span preservation is in domain units (linear scales).
                    const interval = brush.translatedRectangle
                        ? clampRange(
                              intervals[channel],
                              zoomExtent[0],
                              zoomExtent[1]
                          )
                        : intervals[channel];
                    intervals[channel] = (ramp
                        ? normalizeIntervalForSelection(
                              /** @type {[number, number]} */ (interval),
                              zoomExtent
                          )
                        : normalizeIntervalForChannel(
                              scaleResolution,
                              /** @type {[number, number]} */ (interval)
                          )) ?? [zoomExtent[0], zoomExtent[0]];
                }

                setter({ type: "interval", intervals });
            };

            const state = paramRuntime.getIntervalSelectionState(name);
            const cancel = startDocumentDrag({
                onMove: mouseMoveListener,
                hoverContext: view.context,
                onFinish: () => {
                    activeBrush = null;
                    setIntervalDragActive(false);
                },
                onRelease: () => state.finish(this, true),
            });
            this.#cancelActiveDrag = () => {
                const canceled = cancel();
                state.finish(this, false);
                return canceled;
            };
        });

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
                        this.clear();
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
                Math.abs(wheelEvent.deltaX) <= Math.abs(wheelEvent.deltaY) &&
                isActiveIntervalSelection(selectionExpr())
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
 * @param {[number, number]} interval
 * @returns {[number, number] | undefined}
 */
function normalizeIntervalForChannel(scaleResolution, interval) {
    const scale = scaleResolution.getScale();
    return normalizeIntervalForSelection(interval, scaleResolution.zoomExtent, {
        roundToIntegers: scale.type === "index" || scale.type === "locus",
    });
}
