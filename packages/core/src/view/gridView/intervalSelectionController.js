import { isContinuous } from "vega-scale";
import { createPrimitiveEventProxy } from "../../utils/interactionEvent.js";
import { createEventPredicate } from "../../utils/interactionConfig.js";
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
    selectionContainsPoint,
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
 * @property {boolean} [captureInteractions]
 * @property {() => Rectangle | undefined} getInteractionCoords
 * @property {(name: string, point: Point) => boolean} [ownsInteraction]
 * @property {(channel: import("../../spec/channel.js").PrimaryPositionalChannel) => Rectangle} getProjectionCoords
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

    /** @type {string} */
    #selectionName;

    /** @type {import("../../paramRuntime/viewParamRuntime.js").default} */
    #selectionRuntime;

    /** @type {Record<import("../../spec/channel.js").PrimaryPositionalChannel, import("../../scales/scaleResolution.js").default>} */
    #scaleResolutions;

    /** @type {Set<{ listener: (selection: import("../../types/selectionTypes.js").IntervalSelection) => void }>} */
    #commitListeners = new Set();

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
        this.#commitListeners.clear();
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
     * Converts selection intervals using the scales that own the selection.
     *
     * @param {import("../../types/selectionTypes.js").IntervalSelection["intervals"]} intervals
     * @returns {import("../../types/embedApi.js").ComplexIntervals}
     */
    getComplexIntervals(intervals) {
        return Object.fromEntries(
            Object.entries(intervals).map(([channel, interval]) => {
                const primaryChannel =
                    /** @type {import("../../spec/channel.js").PrimaryPositionalChannel} */ (
                        channel
                    );
                return [
                    primaryChannel,
                    interval
                        ? [
                              this.#scaleResolutions[primaryChannel].toComplex(
                                  interval[0]
                              ),
                              this.#scaleResolutions[primaryChannel].toComplex(
                                  interval[1]
                              ),
                          ]
                        : null,
                ];
            })
        );
    }

    /**
     * @param {(selection: import("../../types/selectionTypes.js").IntervalSelection) => void} listener
     * @returns {() => void}
     */
    subscribeCommit(listener) {
        const entry = { listener };
        this.#commitListeners.add(entry);
        return () => this.#commitListeners.delete(entry);
    }

    /**
     * Cancels an active gesture and clears a changed selection.
     */
    clear() {
        this.#cancelActiveDrag();
        this.#clearSelection();
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
        this.#scaleResolutions =
            /** @type {Record<import("../../spec/channel.js").PrimaryPositionalChannel, import("../../scales/scaleResolution.js").default>} */ (
                scaleResolutions
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

        const eventPredicate = createEventPredicate(eventConfig);

        const zoomEventConfig = resolveIntervalZoomEventConfig(
            select.zoom,
            requiresShiftToBrush,
            name
        );
        const zoomEventPredicate = createEventPredicate(zoomEventConfig);
        const clearEventConfig =
            /** @type {import("../../spec/parameter.js").EventConfig | undefined} */ (
                select.clear
            );
        const clearEventPredicate = createEventPredicate(clearEventConfig);

        // --- Validation and early exits done ---

        let preventNextClickPropagation = false;
        /** @type {Point | undefined} */
        let pendingClearStart;
        /**
         * @type {{ start: Point, translatedRectangle: Rectangle | null } | null}
         */
        let activeBrush = null;

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

        const selectionExpr = paramRuntime.createExpression(name);
        const setter = (
            /** @type {import("../../types/selectionTypes.js").IntervalSelection} */
            selection
        ) => {
            paramRuntime.setValue(name, selection);
        };

        if (param.value) {
            setter({ type: "interval", intervals: param.value });
        }

        const clearSelection = () => {
            if (isActiveIntervalSelection(selectionExpr())) {
                setter(createIntervalSelection(channels));
            }
        };
        this.#clearSelection = clearSelection;

        const isInsideHost = (/** @type {Point} */ point) =>
            this.host.getInteractionCoords()?.containsPoint(point.x, point.y) ??
            false;
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
                channels,
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
            : () => {};

        const invertPoint = (
            /** @type {import("../layout/point.js").default} */ point
        ) => {
            const inverted = { x: 0, y: 0 };
            const projectionCoords = this.host.getProjectionCoords(channels[0]);
            const normalizedPoint = projectionCoords.normalizePoint(
                point.x,
                point.y,
                true
            );

            for (const channel of channels) {
                const scale = scaleResolutions[channel].getScale();
                // @ts-ignore
                const val = scale.invert(
                    channel === "x" ? normalizedPoint.x : normalizedPoint.y
                );
                inverted[channel] =
                    val + (["index", "locus"].includes(scale.type) ? 0.5 : 0);
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
            const projectionCoords = this.host.getProjectionCoords(channels[0]);

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
                return projectionCoords.denormalizePoint(px, py, true);
            };

            const a = mapCorner(intervals.x?.[0], intervals.y?.[0], 0);
            const b = mapCorner(intervals.x?.[1], intervals.y?.[1], 1);

            return Rectangle.create(a.x, a.y, b.x - a.x, b.y - a.y);
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
            pendingClearStart = undefined;
            // Keep translation geometry in screen coordinates because scales
            // may be nonlinear.
            const translatedRectangle =
                isActiveIntervalSelection(selection) &&
                selectionContainsPoint(selection, invertPoint(event.point))
                    ? selectionToRect(selection)
                    : null;

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
                        invertPoint(new Point(newRect.x, newRect.y)),
                        invertPoint(new Point(newRect.x2, newRect.y2))
                    );
                } else {
                    intervals = pointsToIntervals(
                        invertPoint(brush.start),
                        invertPoint(current)
                    );
                }

                for (const channel of channels) {
                    const scaleResolution = scaleResolutions[channel];
                    const { zoomExtent } = scaleResolution;
                    const interval = intervals[channel];

                    if (brush.translatedRectangle) {
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

            this.#cancelActiveDrag = startDocumentDrag({
                onMove: mouseMoveListener,
                hoverContext: view.context,
                onFinish: () => {
                    activeBrush = null;
                    setIntervalDragActive(false);
                },
                onRelease: () => this.#notifyCommit(),
            });
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

        const isPointInsideSelection = (/** @type {Point} */ point) =>
            selectionContainsPoint(selectionExpr(), invertPoint(point));

        this.#containsPoint = (point) =>
            isInsideHost(point) &&
            ownsInteraction(point) &&
            isActiveIntervalSelection(selectionExpr()) &&
            isPointInsideSelection(point);

        if (clearEventConfig) {
            this.#addViewInteractionListener(
                clearEventConfig.type,
                (event) => {
                    if (
                        clearEventPredicate(event.proxiedMouseEvent) &&
                        isInsideHost(event.point) &&
                        ownsInteraction(event.point) &&
                        isPointInsideSelection(event.point)
                    ) {
                        clearSelection();
                        event.stopPropagation();
                    }
                },
                true
            );
        }

        this.#addViewInteractionListener("wheel", (event) => {
            const wheelEvent = event.wheelEvent;

            if (
                !zoomEventConfig ||
                !zoomEventPredicate(createPrimitiveEventProxy(wheelEvent))
            ) {
                return;
            }
            if (!isInsideHost(event.point) || !ownsInteraction(event.point)) {
                return;
            }

            if (Math.abs(wheelEvent.deltaX) >= Math.abs(wheelEvent.deltaY)) {
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

        // Setup has already initialized and read the selection expression.
        const selectionRef = paramRuntime.getParamRef(name);

        this.host.view.registerDisposer(
            paramRuntime.effect([selectionRef], () => {
                if (!activeBrush) {
                    this.#notifyCommit();
                }
            })
        );
    }

    /** @type {() => void} */
    #clearSelection = () => {};

    #notifyCommit() {
        const selection = this.#selectionRuntime.getValue(this.#selectionName);
        for (const entry of [...this.#commitListeners]) {
            try {
                entry.listener(selection);
            } catch (error) {
                console.error(error);
            }
        }
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
