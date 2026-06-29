import { isContinuous } from "vega-scale";
import { createPrimitiveEventProxy } from "../../utils/interactionEvent.js";
import { createEventPredicate } from "../../utils/interactionConfig.js";
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

/**
 * Handles interval selection interaction listeners for one grid child.
 */
export class IntervalSelectionController {
    /**
     * @param {import("./gridChild.js").default} gridChild
     * @param {string} name
     * @param {import("../../spec/parameter.js").Parameter} param
     * @param {import("../../spec/parameter.js").IntervalSelectionConfig} select
     */
    constructor(gridChild, name, param, select) {
        this.gridChild = gridChild;

        this.#setup(name, param, select);
    }

    /** @type {import("./gridChild.js").default} */
    gridChild;

    /**
     * @type {{ type: string, listener: import("../view.js").InteractionListener, capture?: boolean }[]}
     */
    #viewListeners = [];

    /**
     * @param {string} type
     * @param {import("../view.js").InteractionListener} listener
     * @param {boolean} [capture]
     */
    #addViewInteractionListener(type, listener, capture) {
        this.gridChild.view.addInteractionListener(type, listener, capture);
        this.#viewListeners.push({ type, listener, capture });
    }

    dispose() {
        for (const { type, listener, capture } of this.#viewListeners) {
            this.gridChild.view.removeInteractionListener(
                type,
                listener,
                capture
            );
        }
        this.#viewListeners = [];
    }

    /**
     * @param {string} name
     * @param {import("../../spec/parameter.js").Parameter} param
     * @param {import("../../spec/parameter.js").IntervalSelectionConfig} select
     */
    #setup(name, param, select) {
        const view = this.gridChild.view;
        const channels = select.encodings;

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

        if (this.gridChild.selectionRect) {
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

        this.gridChild.selectionRect = createSelectionRectOverlay({
            gridChild: this.gridChild,
            selectionExpr,
            selectionExpression: name,
            brushConfig: select.mark,
        });
        const setIntervalDragActive = (/** @type {boolean} */ active) => {
            this.gridChild.selectionRect.view.paramRuntime.setValue(
                INTERVAL_DRAG_ACTIVE_PARAM,
                active
            );
        };

        // WARNING! The following is an async method! Seems to work (by chance).
        // TODO: Should be called and awaited in a sensible place. Maybe provide some
        // registration logic for such post-creation initializations?
        this.gridChild.selectionRect.view.initializeChildren();

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

        this.#addViewInteractionListener("mousedown", (event) => {
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

                const startSelection = eventPredicate(event.proxiedMouseEvent);

                if (startSelection) {
                    clearSelection();
                    nowBrushing = true;
                } else if (
                    clearEventConfig &&
                    isActiveIntervalSelection(selectionExpr())
                ) {
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
                    // This listener is intentionally one-shot and removes
                    // itself on the first mouseup.
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
            const viewOffset = Point.fromMouseEvent(event.mouseEvent).subtract(
                start
            );

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
                document.removeEventListener("mousemove", mouseMoveListener);
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

        if (clearEventConfig) {
            this.#addViewInteractionListener(
                clearEventConfig.type,
                (event) => {
                    if (
                        clearEventPredicate(event.proxiedMouseEvent) &&
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

        // Handle mouse cursor changes
        this.#addViewInteractionListener("mousemove", (event) => {
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
