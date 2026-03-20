import UnitView from "../view/unitView.js";
import { VISIT_STOP } from "../view/view.js";
import { readPickingPixel } from "../gl/webGLHelper.js";
import Inertia, { makeEventTemplate } from "../utils/inertia.js";
import Point from "../view/layout/point.js";
import { isStillZooming } from "../view/zoom.js";
import createTooltipContext from "../tooltip/tooltipContext.js";
import { FREEZE_INTERACTION_CLASS_NAME } from "../utils/ui/tooltip.js";
import InteractionDispatcher from "./interactionDispatcher.js";
import CursorManager from "./cursorManager.js";

export default class InteractionController {
    /** @type {import("../view/view.js").default} */
    #viewRoot;
    /** @type {import("../gl/webGLHelper.js").default} */
    #glHelper;
    /** @type {import("../utils/ui/tooltip.js").default} */
    #tooltip;
    /** @type {import("../utils/animator.js").default} */
    #animator;
    /** @type {(type: string, event: any) => void} */
    #emitEvent;
    /** @type {Record<string, import("../tooltip/tooltipHandler.js").TooltipHandler>} */
    #tooltipHandlers;
    /** @type {() => void} */
    #renderPickingFramebuffer;
    /** @type {() => number} */
    #getDevicePixelRatio;
    /** @type {InteractionDispatcher} */
    #interactionDispatcher;
    /** @type {CursorManager} */
    #cursorManager;
    /**
     * @type {{ mark: import("../marks/mark.js").default, datum: import("../data/flowNode.js").Datum, uniqueId: number }}
     */
    #currentHover;
    /** @type {Inertia} */
    #wheelInertia;
    /** @type {Point} */
    #mouseDownCoords;
    /** @type {Point | undefined} */
    #lastPointerPoint;
    /** @type {boolean} */
    #tooltipUpdateRequested;
    /** @type {number} */
    #hoverTrackingSuspensionCount;
    /** @type {boolean} */
    #postRenderHoverRefreshRequested;
    /**
     * @param {object} options
     * @param {import("../view/view.js").default} options.viewRoot
     * @param {import("../gl/webGLHelper.js").default} options.glHelper
     * @param {import("../utils/ui/tooltip.js").default} options.tooltip
     * @param {import("../utils/animator.js").default} options.animator
     * @param {(type: string, event: any) => void} options.emitEvent
     * @param {Record<string, import("../tooltip/tooltipHandler.js").TooltipHandler>} options.tooltipHandlers
     * @param {() => void} options.renderPickingFramebuffer
     * @param {() => number} options.getDevicePixelRatio
     */
    constructor({
        viewRoot,
        glHelper,
        tooltip,
        animator,
        emitEvent,
        tooltipHandlers,
        renderPickingFramebuffer,
        getDevicePixelRatio,
    }) {
        this.#viewRoot = viewRoot;
        this.#glHelper = glHelper;
        this.#tooltip = tooltip;
        this.#animator = animator;
        this.#emitEvent = emitEvent;
        this.#tooltipHandlers = tooltipHandlers;
        this.#renderPickingFramebuffer = renderPickingFramebuffer;
        this.#getDevicePixelRatio = getDevicePixelRatio;
        this.#interactionDispatcher = new InteractionDispatcher({ viewRoot });
        this.#cursorManager = new CursorManager({ canvas: glHelper.canvas });

        /**
         * Currently hovered mark and datum
         * @type {{ mark: import("../marks/mark.js").default, datum: import("../data/flowNode.js").Datum, uniqueId: number }}
         */
        this.#currentHover = undefined;

        this.#wheelInertia = new Inertia(this.#animator);

        /** @type {Point} */
        this.#mouseDownCoords = undefined;
        this.#lastPointerPoint = undefined;

        this.#tooltipUpdateRequested = false;
        this.#hoverTrackingSuspensionCount = 0;
        this.#postRenderHoverRefreshRequested = false;
    }

    getCurrentHover() {
        return this.#currentHover;
    }

    suspendHoverTracking() {
        this.#hoverTrackingSuspensionCount++;
        this.#tooltip.clear();
        this.#tooltipUpdateRequested = false;
    }

    /**
     * @param {MouseEvent} [mouseEvent]
     */
    resumeHoverTracking(mouseEvent) {
        if (this.#hoverTrackingSuspensionCount <= 0) {
            return;
        }

        this.#hoverTrackingSuspensionCount--;
        if (this.#hoverTrackingSuspensionCount > 0) {
            return;
        }

        this.#tooltip.clear();
        this.#tooltipUpdateRequested = false;

        if (this.#isInteractionFrozen()) {
            return;
        }

        if (mouseEvent) {
            const point = this.#toCanvasPoint(mouseEvent);
            this.#lastPointerPoint = point;
            if (this.#isInsideCanvas(point)) {
                this.#refreshHover(point);
                this.#cursorManager.update({
                    target: this.#interactionDispatcher.getCurrentTarget(),
                    hover: this.#currentHover,
                });
                return;
            }

            this.#interactionDispatcher.handlePointerLeave(mouseEvent);
        } else if (
            this.#lastPointerPoint &&
            this.#isInsideCanvas(this.#lastPointerPoint)
        ) {
            this.#refreshHover(this.#lastPointerPoint);
            this.#cursorManager.update({
                target: this.#interactionDispatcher.getCurrentTarget(),
                hover: this.#currentHover,
            });
            return;
        }

        this.#currentHover = null;
        this.#cursorManager.clear();
    }

    registerInteractionEvents() {
        const canvas = this.#glHelper.canvas;

        let lastWheelEvent = performance.now();
        let longPressTriggered = false;
        /** @type {{ pointerCount: 1 | 2, centerX: number, centerY: number, distance: number } | undefined} */
        let previousTouchGesture;

        /**
         * @param {Point} point
         * @param {import("../utils/interactionEvent.js").InteractionUiEvent} uiEvent
         * @returns {import("../utils/interaction.js").default}
         */
        const dispatchInteraction = (point, uiEvent) => {
            const interaction = this.#interactionDispatcher.dispatch(
                point,
                uiEvent
            );

            if (!this.#tooltipUpdateRequested) {
                this.#tooltip.clear();
            }

            if (uiEvent instanceof MouseEvent && uiEvent.type !== "mouseout") {
                this.#cursorManager.update({
                    target: interaction.target,
                    hover: this.#currentHover,
                });
            }

            return interaction;
        };

        /** @param {Event} event */
        const listener = (event) => {
            const now = performance.now();
            const wheeling = now - lastWheelEvent < 200;

            if (event instanceof MouseEvent) {
                if (
                    event.type !== "contextmenu" &&
                    this.#isInteractionFrozen()
                ) {
                    return;
                }

                const point = this.#toCanvasPoint(event);
                this.#lastPointerPoint = point;

                if (
                    event.type == "mousemove" &&
                    !wheeling &&
                    this.#hoverTrackingSuspensionCount === 0
                ) {
                    this.#tooltip.handleMouseMove(event);
                    this.#tooltipUpdateRequested = false;

                    // Disable picking during dragging. Also postpone picking until
                    // the user has stopped zooming as reading pixels from the
                    // picking buffer is slow and ruins smooth animations.
                    if (event.buttons == 0 && !isStillZooming()) {
                        this.#renderPickingFramebuffer();
                        this.#handlePicking(point.x, point.y);
                    }
                }

                /**
                 * @param {MouseEvent} dispatchedEvent
                 */
                const dispatchEvent = (dispatchedEvent) => {
                    dispatchInteraction(point, dispatchedEvent);
                };

                if (event.type != "wheel") {
                    this.#wheelInertia.cancel();
                }

                if (
                    (event.type == "mousedown" || event.type == "mouseup") &&
                    !isStillZooming()
                ) {
                    // Actually, only needed when clicking on a mark
                    this.#renderPickingFramebuffer();
                } else if (event.type == "wheel") {
                    lastWheelEvent = now;
                    this.#tooltipUpdateRequested = false;

                    const wheelEvent = /** @type {WheelEvent} */ (event);

                    if (
                        Math.abs(wheelEvent.deltaX) >
                        Math.abs(wheelEvent.deltaY)
                    ) {
                        // If the viewport is panned (horizontally) using the wheel (touchpad),
                        // the picking buffer becomes stale and needs redrawing. However, we
                        // optimize by just clearing the currently hovered item so that snapping
                        // doesn't work incorrectly when zooming in/out.

                        // TODO: More robust solution (handle at higher level such as ScaleResolution's zoom method)
                        this.#currentHover = null;

                        this.#wheelInertia.cancel();
                    } else {
                        // We must decide on the native wheel event whether to
                        // call preventDefault() (to block page scrolling).
                        // This probe asks the pointed view hierarchy to claim
                        // wheel ownership without running real wheel side
                        // effects first. Inertia is layered on top of that
                        // decision and is not the reason for the probe.
                        const probeEvent = dispatchInteraction(point, {
                            type: "wheelclaimprobe",
                        });

                        if (probeEvent.wheelClaimed) {
                            // Vertical wheeling zooms.
                            // We use inertia to generate fake wheel events for smoother zooming

                            const template = makeEventTemplate(wheelEvent);

                            this.#wheelInertia.setMomentum(
                                wheelEvent.deltaY *
                                    (wheelEvent.deltaMode ? 80 : 1),
                                (delta) => {
                                    const e = new WheelEvent("wheel", {
                                        ...template,
                                        deltaMode: 0,
                                        deltaX: 0,
                                        deltaY: delta,
                                    });
                                    dispatchEvent(e);
                                }
                            );

                            wheelEvent.preventDefault();
                            return;
                        } else {
                            this.#wheelInertia.cancel();
                        }
                    }
                }

                // TODO: Should be handled at the view level, not globally
                if (event.type == "click") {
                    if (longPressTriggered) {
                        return;
                    }

                    const e = this.#currentHover
                        ? {
                              type: event.type,
                              viewPath: this.#currentHover.mark.unitView
                                  .getLayoutAncestors()
                                  .map(
                                      /** @param {import("../view/view.js").default} view */
                                      (view) => view.name
                                  )
                                  .reverse(),
                              datum: this.#currentHover.datum,
                          }
                        : {
                              type: event.type,
                              viewPath: null,
                              datum: null,
                          };

                    this.#emitEvent("click", e);
                }

                if (
                    event.type != "click" ||
                    // Suppress click events if the mouse has been dragged
                    this.#mouseDownCoords?.subtract(Point.fromMouseEvent(event))
                        .length < 3
                ) {
                    const interaction = dispatchInteraction(point, event);

                    if (
                        event.type == "dblclick" &&
                        this.#hoverTrackingSuspensionCount === 0 &&
                        this.#isInsideCanvas(point)
                    ) {
                        this.#scheduleHoverRefreshAfterRender();
                    }

                    return interaction;
                }
            }
        };

        [
            "mousedown",
            "mouseup",
            "wheel",
            "click",
            "mousemove",
            "contextmenu",
            "dblclick",
        ].forEach((type) => canvas.addEventListener(type, listener));

        /**
         * @param {number} clientX
         * @param {number} clientY
         */
        const toCanvasPoint = (clientX, clientY) => {
            const rect = canvas.getBoundingClientRect();
            return new Point(
                clientX - rect.left - canvas.clientLeft,
                clientY - rect.top - canvas.clientTop
            );
        };

        /**
         * @param {TouchList} touches
         */
        const readTouchGesture = (touches) => {
            if (touches.length <= 0) {
                return;
            }

            const first = touches[0];

            if (touches.length === 1) {
                return {
                    pointerCount: /** @type {1} */ (1),
                    centerX: first.clientX,
                    centerY: first.clientY,
                    distance: 0,
                };
            }

            const second = touches[1];
            return {
                pointerCount: /** @type {2} */ (2),
                centerX: (first.clientX + second.clientX) / 2,
                centerY: (first.clientY + second.clientY) / 2,
                distance: getClientDistance(first, second),
            };
        };

        /**
         * @param {number} x
         * @param {number} y
         * @param {"move" | "end"} phase
         * @param {1 | 2} pointerCount
         * @param {number} xDelta
         * @param {number} yDelta
         * @param {number} zDelta
         */
        const dispatchTouchGestureEvent = (
            x,
            y,
            phase,
            pointerCount,
            xDelta,
            yDelta,
            zDelta
        ) => {
            const point = toCanvasPoint(x, y);
            dispatchInteraction(point, {
                type: "touchgesture",
                phase,
                pointerCount,
                xDelta,
                yDelta,
                zDelta,
            });
        };

        /**
         * @param {TouchEvent} touchEvent
         */
        const handleTouchStartOrMove = (touchEvent) => {
            touchEvent.preventDefault();
            this.#wheelInertia.cancel();
            this.#tooltipUpdateRequested = false;

            const currentGesture = readTouchGesture(touchEvent.touches);
            if (!currentGesture) {
                previousTouchGesture = undefined;
                return;
            }

            if (
                !previousTouchGesture ||
                previousTouchGesture.pointerCount !==
                    currentGesture.pointerCount
            ) {
                previousTouchGesture = currentGesture;
                return;
            }

            const xDelta =
                currentGesture.centerX - previousTouchGesture.centerX;
            const yDelta =
                currentGesture.centerY - previousTouchGesture.centerY;
            const zDelta =
                currentGesture.pointerCount === 2
                    ? pinchDistanceToZoomDelta(
                          previousTouchGesture.distance,
                          currentGesture.distance
                      )
                    : 0;

            if (
                (xDelta !== 0 || yDelta !== 0 || zDelta !== 0) &&
                Number.isFinite(xDelta) &&
                Number.isFinite(yDelta) &&
                Number.isFinite(zDelta)
            ) {
                dispatchTouchGestureEvent(
                    previousTouchGesture.centerX,
                    previousTouchGesture.centerY,
                    "move",
                    currentGesture.pointerCount,
                    xDelta,
                    yDelta,
                    zDelta
                );
            }

            previousTouchGesture = currentGesture;
        };

        /**
         * @param {TouchEvent} touchEvent
         */
        const handleTouchEndOrCancel = (touchEvent) => {
            touchEvent.preventDefault();
            this.#tooltipUpdateRequested = false;
            if (previousTouchGesture && touchEvent.touches.length === 0) {
                dispatchTouchGestureEvent(
                    previousTouchGesture.centerX,
                    previousTouchGesture.centerY,
                    "end",
                    previousTouchGesture.pointerCount,
                    0,
                    0,
                    0
                );
            }

            previousTouchGesture = readTouchGesture(touchEvent.touches);
        };

        canvas.addEventListener("touchstart", handleTouchStartOrMove, {
            passive: false,
        });
        canvas.addEventListener("touchmove", handleTouchStartOrMove, {
            passive: false,
        });
        canvas.addEventListener("touchend", handleTouchEndOrCancel, {
            passive: false,
        });
        canvas.addEventListener("touchcancel", handleTouchEndOrCancel, {
            passive: false,
        });

        canvas.addEventListener("mousedown", (/** @type {MouseEvent} */ e) => {
            this.#mouseDownCoords = Point.fromMouseEvent(e);
            if (this.#tooltip.sticky) {
                this.#tooltip.sticky = false;
                this.#tooltip.clear();
                // A hack to prevent selection if the tooltip is sticky.
                // Let the tooltip be destickified first.
                longPressTriggered = true;
            } else {
                longPressTriggered = false;
            }

            const disableTooltip = () => {
                document.addEventListener(
                    "mouseup",
                    () => this.#tooltip.popEnabledState(),
                    { once: true }
                );
                this.#tooltip.pushEnabledState(false);
            };

            // Opening context menu or using modifier keys disables the tooltip
            if (e.button == 2 || e.shiftKey || e.ctrlKey || e.metaKey) {
                disableTooltip();
            } else if (this.#tooltip.visible) {
                // Make tooltip sticky if the user long-presses
                const timeout = setTimeout(() => {
                    longPressTriggered = true;
                    this.#tooltip.sticky = true;
                }, 400);

                const clear = () => clearTimeout(timeout);
                document.addEventListener("mouseup", clear, { once: true });
                document.addEventListener("mousemove", clear, { once: true });
            }
        });

        // Prevent text selections etc while dragging
        canvas.addEventListener("dragstart", (event) =>
            event.stopPropagation()
        );

        canvas.addEventListener("mouseout", (event) => {
            if (this.#isInteractionFrozen()) {
                return;
            }

            if (this.#hoverTrackingSuspensionCount > 0) {
                this.#tooltip.clear();
                this.#tooltipUpdateRequested = false;
                return;
            }

            this.#interactionDispatcher.handlePointerLeave(
                /** @type {MouseEvent} */ (event)
            );
            this.#cursorManager.clear();
            this.#tooltip.clear();
            this.#currentHover = null;
        });
    }

    /**
     * @param {MouseEvent} event
     */
    #toCanvasPoint(event) {
        const canvas = this.#glHelper.canvas;
        const rect = canvas.getBoundingClientRect();
        return new Point(
            event.clientX - rect.left - canvas.clientLeft,
            event.clientY - rect.top - canvas.clientTop
        );
    }

    /**
     * @param {Point} point
     */
    #isInsideCanvas(point) {
        const canvas = this.#glHelper.canvas;
        return (
            point.x >= 0 &&
            point.y >= 0 &&
            point.x <= canvas.clientWidth &&
            point.y <= canvas.clientHeight
        );
    }

    /**
     * @param {Point} point
     */
    #refreshHover(point) {
        if (!isStillZooming()) {
            this.#renderPickingFramebuffer();
            this.#handlePicking(point.x, point.y);
        }
    }

    #scheduleHoverRefreshAfterRender() {
        if (this.#postRenderHoverRefreshRequested) {
            return;
        }

        this.#postRenderHoverRefreshRequested = true;
        this.#animator.requestRender();
        window.requestAnimationFrame(() => {
            this.#postRenderHoverRefreshRequested = false;

            if (
                this.#hoverTrackingSuspensionCount > 0 ||
                this.#isInteractionFrozen()
            ) {
                return;
            }

            const point = this.#lastPointerPoint;
            if (!point || !this.#isInsideCanvas(point)) {
                this.#currentHover = null;
                this.#cursorManager.clear();
                return;
            }

            this.#tooltip.clear();
            this.#tooltipUpdateRequested = false;
            this.#refreshHover(point);
            this.#cursorManager.update({
                target: this.#interactionDispatcher.getCurrentTarget(),
                hover: this.#currentHover,
            });
        });
    }

    #isInteractionFrozen() {
        return (
            typeof document !== "undefined" &&
            !!document.body &&
            document.body.classList.contains(FREEZE_INTERACTION_CLASS_NAME)
        );
    }

    /**
     * @param {number} x
     * @param {number} y
     */
    #handlePicking(x, y) {
        const dpr = this.#getDevicePixelRatio();
        const pp = readPickingPixel(
            this.#glHelper.gl,
            this.#glHelper._pickingBufferInfo,
            x * dpr,
            y * dpr
        );

        const uniqueId = pp[0] | (pp[1] << 8) | (pp[2] << 16) | (pp[3] << 24);

        if (uniqueId == 0) {
            this.#currentHover = null;
            return;
        }

        if (uniqueId !== this.#currentHover?.uniqueId) {
            this.#currentHover = null;
        }

        if (!this.#currentHover) {
            this.#viewRoot.visit((view) => {
                if (view instanceof UnitView) {
                    if (
                        view.mark.isPickingParticipant() &&
                        [...view.facetCoords.values()].some((coords) =>
                            coords.containsPoint(x, y)
                        )
                    ) {
                        const datum = view
                            .getCollector()
                            .findDatumByUniqueId(uniqueId);
                        if (datum) {
                            this.#currentHover = {
                                mark: view.mark,
                                datum,
                                uniqueId,
                            };
                        }
                    }
                    if (this.#currentHover) {
                        return VISIT_STOP;
                    }
                }
            });
        }

        if (this.#currentHover) {
            const mark = this.#currentHover.mark;
            this.updateTooltip(this.#currentHover.datum, async (datum) => {
                if (!mark.isPickingParticipant()) {
                    return;
                }

                const tooltipProps = mark.properties.tooltip;

                if (tooltipProps !== null) {
                    const handlerName = tooltipProps?.handler ?? "default";
                    const handler = this.#tooltipHandlers[handlerName];
                    if (!handler) {
                        throw new Error(
                            "No such tooltip handler: " + handlerName
                        );
                    }

                    const context = createTooltipContext(
                        datum,
                        mark,
                        tooltipProps?.params
                    );
                    return handler(datum, mark, tooltipProps?.params, context);
                }
            });
        }
    }

    /**
     * This method should be called in a mouseMove handler. If not called, the
     * tooltip will be hidden.
     *
     * @param {T} datum
     * @param {function(T):Promise<string | HTMLElement | import("lit").TemplateResult>} [converter]
     * @template T
     */
    updateTooltip(datum, converter) {
        if (!this.#tooltipUpdateRequested || !datum) {
            this.#tooltip.updateWithDatum(datum, converter);
            this.#tooltipUpdateRequested = true;
        } else {
            throw new Error(
                "Tooltip has already been updated! Duplicate event handler?"
            );
        }
    }
}

/**
 * @typedef {{clientX: number, clientY: number}} ClientPointLike
 */

/**
 * Returns euclidean distance between two client-space points.
 *
 * @param {ClientPointLike} a
 * @param {ClientPointLike} b
 */
function getClientDistance(a, b) {
    const dx = b.clientX - a.clientX;
    const dy = b.clientY - a.clientY;
    return Math.hypot(dx, dy);
}

/**
 * Converts a pinch distance ratio to a zDelta used by interactionToZoom:
 * scaleFactor = 2 ** zDelta.
 *
 * @param {number} previousDistance
 * @param {number} currentDistance
 */
function pinchDistanceToZoomDelta(previousDistance, currentDistance) {
    if (previousDistance <= 0 || currentDistance <= 0) {
        return 0;
    }

    return Math.log2(previousDistance / currentDistance);
}
