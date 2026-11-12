import UnitView from "../view/unitView.js";
import { VISIT_STOP } from "../view/view.js";
import Inertia, { makeEventTemplate } from "../utils/inertia.js";
import Point from "../view/layout/point.js";
import { isStillZooming, stopPanInertia } from "../view/zoom.js";
import createTooltipContext from "../tooltip/tooltipContext.js";
import { FREEZE_INTERACTION_CLASS_NAME } from "../utils/ui/tooltip.js";
import InteractionDispatcher from "./interactionDispatcher.js";
import { shallowArrayEquals } from "../utils/arrayUtils.js";
import { isFacetSpec } from "../view/viewSpecGuards.js";
import CursorManager from "./cursorManager.js";
import EventListenerRegistry from "./eventListenerRegistry.js";
import {
    aliasedPointerEventTypes,
    getInteractionEventType,
} from "../utils/interactionEvent.js";

/** @typedef {import("../types/interactionApi.d.ts").InternalMarkHit} InternalMarkHit */
/** @typedef {import("../types/interactionApi.d.ts").MarkInteractionEvent} MarkInteractionEvent */
/** @typedef {import("../types/interactionApi.d.ts").NativeInteractionEvent} NativeInteractionEvent */

export default class InteractionController {
    /** @type {import("../view/view.js").default} */
    #viewRoot;
    /** @type {HTMLCanvasElement} */
    #canvas;
    /** @type {import("../utils/ui/tooltip.js").default} */
    #tooltip;
    /** @type {import("../utils/animator.js").default} */
    #animator;
    /** @type {(type: string, event: object) => void} */
    #emitEvent;
    /** @type {Record<string, import("../tooltip/tooltipHandler.js").TooltipHandler>} */
    #tooltipHandlers;
    /** @type {() => void} */
    #renderPickingFramebuffer;
    /** @type {((x: number, y: number) => number | null | Promise<number | null>) | undefined} */
    #readPickingId;
    /** @type {InteractionDispatcher} */
    #interactionDispatcher;
    /** @type {CursorManager} */
    #cursorManager;
    /** @type {InternalMarkHit | null | undefined} */
    #currentHover;
    /** @type {Inertia} */
    #wheelInertia;

    /** @type {object | undefined} */
    #wheelOwner;

    /** @type {"default" | "cooperative"} */
    #wheelBehavior;

    /** @type {Point} */
    #mouseDownCoords;
    /** @type {Point | undefined} */
    #lastPointerPoint;
    #tooltipUpdateRequested = false;
    #longPressPending = false;
    #suppressTooltipUntilMouseMove = false;
    #hoverTrackingSuspensionCount = 0;
    #postRenderHoverRefreshRequested = false;
    #pickingRequestId = 0;
    /** @type {EventListenerRegistry<NativeInteractionEvent>} */
    #nativeEventListeners = new EventListenerRegistry();
    /** @type {Set<{ view: import("../view/view.js").default, type: string, listener: (event: MarkInteractionEvent) => void | Promise<void> }>} */
    #markEventListeners = new Set();
    /** @type {Set<{ view: import("../view/view.js").default, listener: (hit: InternalMarkHit | undefined) => void }>} */
    #hoverListeners = new Set();
    /** @type {number | undefined} */
    #currentHoverRequestId;
    /** @type {(error: unknown) => void} */
    #reportError = (error) => console.error(error);
    /** @type {() => boolean} */
    #canPick = () => true;

    #dismissStickyTooltip() {
        this.#tooltip.sticky = false;
        this.#suppressTooltipUntilMouseMove = true;
        this.#tooltip.clear();
    }

    /**
     * @param {object} options
     * @param {import("../view/view.js").default} options.viewRoot
     * @param {HTMLCanvasElement} options.canvas
     * @param {import("../utils/ui/tooltip.js").default} options.tooltip
     * @param {import("../utils/animator.js").default} options.animator
     * @param {(type: string, event: object) => void} options.emitEvent
     * @param {Record<string, import("../tooltip/tooltipHandler.js").TooltipHandler>} options.tooltipHandlers
     * @param {() => void} [options.renderPickingFramebuffer]
     * @param {(x: number, y: number) => number | null | Promise<number | null>} [options.readPickingId]
     * @param {(error: unknown) => void} [options.reportError]
     * @param {() => boolean} [options.canPick]
     * @param {"default" | "cooperative"} [options.wheelBehavior]
     */
    constructor({
        viewRoot,
        canvas,
        tooltip,
        animator,
        emitEvent,
        tooltipHandlers,
        renderPickingFramebuffer,
        readPickingId,
        reportError,
        canPick,
        wheelBehavior = "default",
    }) {
        this.#viewRoot = viewRoot;
        this.#wheelBehavior = wheelBehavior;
        this.#canvas = canvas;
        this.#tooltip = tooltip;
        this.#animator = animator;
        this.#emitEvent = emitEvent;
        this.#tooltipHandlers = tooltipHandlers;
        this.#renderPickingFramebuffer = renderPickingFramebuffer ?? (() => {});
        this.#readPickingId = readPickingId;
        this.#reportError = reportError ?? this.#reportError;
        this.#canPick = canPick ?? this.#canPick;
        this.#interactionDispatcher = new InteractionDispatcher({ viewRoot });
        this.#cursorManager = new CursorManager({ canvas });

        /** Currently hovered mark and datum. */
        this.#currentHover = undefined;

        this.#wheelInertia = new Inertia(this.#animator);

        /** @type {Point} */
        this.#mouseDownCoords = undefined;
        this.#lastPointerPoint = undefined;
    }

    getCurrentHover() {
        return this.#currentHover;
    }

    /**
     * @param {import("../view/view.js").default} view
     * @param {string} type
     * @param {(event: MarkInteractionEvent) => void | Promise<void>} listener
     * @returns {() => void}
     */
    subscribeMarkEvent(view, type, listener) {
        if (!["click", "dblclick", "contextmenu"].includes(type)) {
            throw new Error(`Unsupported mark event type: ${type}`);
        }

        const entry = { view, type, listener };
        this.#markEventListeners.add(entry);
        return () => this.#markEventListeners.delete(entry);
    }

    /**
     * @param {import("../view/view.js").default} view
     * @param {(hit: InternalMarkHit | undefined) => void} listener
     * @returns {() => void}
     */
    subscribeHover(view, listener) {
        const entry = { view, listener };
        this.#hoverListeners.add(entry);
        try {
            listener(this.#getScopedHover(view));
        } catch (error) {
            this.#reportError(error);
        }
        return () => this.#hoverListeners.delete(entry);
    }

    /**
     * Explicitly queries the latest completed picking frame.
     *
     * @param {{ x: number, y: number }} point
     * @param {import("../view/view.js").default} [scopeView]
     * @returns {Promise<{ status: "hit", hit: InternalMarkHit } | { status: "empty" } | { status: "invalidated" }>}
     */
    async pick(point, scopeView) {
        if (!this.#readPickingId) {
            throw new Error(
                "Explicit picking is not supported by this renderer."
            );
        }
        const canvasPoint = new Point(point.x, point.y);
        if (!this.#isInsideCanvas(canvasPoint)) {
            throw new Error("Pick point must be inside the canvas.");
        }
        if (!this.#canPick()) {
            return { status: "invalidated" };
        }

        const requestId = this.#pickingRequestId;
        this.#renderPickingFramebuffer();
        const result = this.#readPickingId(point.x, point.y);
        const uniqueId = await result;
        if (requestId !== this.#pickingRequestId) {
            return { status: "invalidated" };
        }

        const hit = this.#findHit(point.x, point.y, uniqueId ?? 0, scopeView);
        return hit ? { status: "hit", hit } : { status: "empty" };
    }

    invalidatePendingPicks() {
        this.#pickingRequestId++;
    }

    /**
     * Subscribes to native canvas input before Core routes the event.
     *
     * @param {string} type
     * @param {(event: NativeInteractionEvent) => void} listener
     * @returns {() => void}
     */
    subscribeNativeEvent(type, listener) {
        const supported = [
            "click",
            "dblclick",
            "contextmenu",
            "mousedown",
            "mouseup",
            "mousemove",
            "mouseenter",
            "mouseleave",
            "wheel",
        ];
        if (!supported.includes(type)) {
            throw new Error(`Unsupported native event type: ${type}`);
        }

        this.#nativeEventListeners.add(type, listener);
        return () => this.#nativeEventListeners.remove(type, listener);
    }

    suspendHoverTracking() {
        this.#hoverTrackingSuspensionCount++;
        if (this.#longPressPending) {
            return;
        }

        this.#clearHover();
        this.#clearTooltip();
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

        this.#clearTooltip();

        if (this.#isInteractionFrozen()) {
            return;
        }

        if (mouseEvent) {
            const point = this.#toCanvasPoint(mouseEvent);
            this.#lastPointerPoint = point;
            if (this.#isInsideCanvas(point)) {
                this.#refreshHoverAndCursor(point);
                return;
            }

            this.#interactionDispatcher.handlePointerLeave(mouseEvent);
        } else if (
            this.#lastPointerPoint &&
            this.#isInsideCanvas(this.#lastPointerPoint)
        ) {
            this.#refreshHoverAndCursor(this.#lastPointerPoint);
            return;
        }

        this.#clearHover();
        this.#cursorManager.clear();
    }

    /**
     * @returns {() => void}
     */
    registerInteractionEvents() {
        const canvas = this.#canvas;
        const listeners = new AbortController();
        const options = { signal: listeners.signal };

        let lastWheelEvent = performance.now();
        let longPressTriggered = false;
        let lastPressWasTouch = false;
        /** @type {{ id: number, button: number, timer?: ReturnType<typeof setTimeout> } | undefined} */
        let press;

        /** @param {PointerEvent} [event] */
        const finishPress = (event) => {
            if (!press || (event && press.id !== event.pointerId)) return;

            const moved =
                event?.type === "pointermove" || event?.type === "pointerleave";
            if (moved && !this.#longPressPending) return;

            const { button, timer } = press;
            press = undefined;
            if (button === 2) {
                this.#tooltip.popEnabledState();
                return;
            }

            clearTimeout(timer);
            if (!this.#longPressPending) return;

            this.#longPressPending = false;
            if (moved && this.#hoverTrackingSuspensionCount > 0) {
                this.#clearTooltip();
            }
        };

        /**
         * @param {Point} point
         * @param {import("../utils/interactionEvent.js").InteractionUiEvent} uiEvent
         * @param {InternalMarkHit | null} [markHit]
         * @returns {import("../utils/interaction.js").default}
         */
        const dispatchInteraction = (point, uiEvent, markHit) => {
            const interaction = this.#interactionDispatcher.dispatch(
                point,
                uiEvent,
                markHit
            );

            if (!this.#tooltipUpdateRequested && !this.#longPressPending) {
                this.#tooltip.clear();
            }

            if (
                uiEvent instanceof MouseEvent &&
                this.#hoverTrackingSuspensionCount === 0
            ) {
                this.#updateCursor(interaction.target);
            }

            return interaction;
        };

        // GPU readback can be slower than mousemove delivery. Keep only one
        // active hover read and the latest superseding pointer intent.
        /** @type {{ point: Point, event: MouseEvent } | undefined} */
        let queuedMouseMove;
        /** @type {object | undefined} */
        let activeHoverPick;

        /**
         * Coalesces hover picks so delayed mousemoves are not replayed in a
         * burst. Clicks use separate picks because every click must retain its
         * own coordinate and event ordering.
         *
         * @param {Point} point
         * @param {MouseEvent} event
         */
        const startHoverPick = (point, event) => {
            const request = {};
            activeHoverPick = request;
            /** @type {InternalMarkHit | null | undefined} */
            let eventHit;
            const promise = this.#handlePicking(
                point.x,
                point.y,
                () => activeHoverPick === request && !queuedMouseMove,
                (hit) => {
                    eventHit = hit ?? null;
                }
            );
            if (!promise) {
                activeHoverPick = undefined;
                dispatchInteraction(point, event, eventHit);
                return;
            }

            void promise.then((applied) => {
                if (activeHoverPick !== request) {
                    return;
                }
                activeHoverPick = undefined;
                if (applied) {
                    dispatchInteraction(point, event, eventHit);
                }
                const queued = queuedMouseMove;
                queuedMouseMove = undefined;
                if (queued) {
                    startHoverPick(queued.point, queued.event);
                }
            });
        };

        /** @type {Promise<void> | undefined} */
        let pendingDiscrete;
        /** @param {Promise<boolean>} pick @param {() => void} dispatch */
        const dispatchPicked = (pick, dispatch) => {
            const task = pick.then((applied) => {
                if (pendingDiscrete === task) pendingDiscrete = undefined;
                if (applied) dispatch();
            });
            pendingDiscrete = task;
        };

        /** @param {Event} event @param {Point} [canvasPoint] */
        const listener = (event, canvasPoint) => {
            const now = performance.now();
            const wheeling = now - lastWheelEvent < 200;

            if (event instanceof MouseEvent) {
                const type = getInteractionEventType(event.type);
                const point = canvasPoint ?? this.#toCanvasPoint(event);
                if (type === "click" || type === "dblclick") {
                    const fromPointer = event.isTrusted && event.detail > 0;
                    // Older Safari delivers touch-generated clicks as MouseEvents.
                    const touchClick =
                        "pointerType" in event
                            ? event.pointerType === "touch"
                            : lastPressWasTouch && fromPointer;
                    if (
                        touchClick ||
                        (fromPointer && !this.#isInsideCanvas(point))
                    ) {
                        return;
                    }
                }
                let viewDefaultPrevented = false;
                this.#nativeEventListeners.emit(
                    type,
                    {
                        sourceEvent: event,
                        point,
                        preventViewDefault: () => {
                            viewDefaultPrevented = true;
                        },
                    },
                    this.#reportError
                );
                if (viewDefaultPrevented) {
                    if (type === "wheel") {
                        this.#stopWheelInteraction();
                    }
                    return;
                }

                /** @type {Promise<boolean> | undefined} */
                let markPickPromise;
                /** @type {InternalMarkHit | null | undefined} */
                let eventHit;
                if (["click", "dblclick", "contextmenu"].includes(type)) {
                    markPickPromise = this.#handlePicking(
                        point.x,
                        point.y,
                        undefined,
                        (hit) => {
                            eventHit = hit ?? null;
                            this.#emitMarkEvent(event, point, hit);
                        },
                        pendingDiscrete
                    );
                }

                if (type !== "contextmenu" && this.#isInteractionFrozen()) {
                    if (type === "wheel") {
                        this.#stopWheelInteraction();
                    }
                    return;
                }

                this.#lastPointerPoint = point;

                let hoverPickHandled = false;

                if (
                    type == "mousemove" &&
                    !wheeling &&
                    this.#hoverTrackingSuspensionCount === 0
                ) {
                    this.#suppressTooltipUntilMouseMove = false;
                    this.#tooltip.handleMouseMove(event);
                    this.#tooltipUpdateRequested = false;

                    // Disable picking during dragging. Also postpone picking until
                    // the user has stopped zooming as reading pixels from the
                    // picking buffer is slow and ruins smooth animations.
                    if (event.buttons == 0 && !isStillZooming()) {
                        if (activeHoverPick) {
                            queuedMouseMove = { point, event };
                        } else {
                            startHoverPick(point, event);
                        }
                        hoverPickHandled = true;
                    }
                }

                if (type == "mousemove" && !hoverPickHandled) {
                    // A drag or temporarily suppressed hover supersedes the
                    // pending hover; its eventual result must not replay.
                    activeHoverPick = undefined;
                    queuedMouseMove = undefined;
                }

                if (hoverPickHandled) {
                    this.#wheelInertia.cancel();
                    return;
                }

                if (type != "wheel") {
                    this.#wheelInertia.cancel();
                }

                if (
                    (type == "mousedown" || type == "mouseup") &&
                    !isStillZooming()
                ) {
                    // Actually, only needed when clicking on a mark
                    this.#renderPickingFramebuffer();
                } else if (type == "wheel") {
                    lastWheelEvent = now;
                    this.#tooltipUpdateRequested = false;

                    const wheelEvent = /** @type {WheelEvent} */ (event);

                    const horizontal =
                        Math.abs(wheelEvent.deltaX) >
                        Math.abs(wheelEvent.deltaY);
                    const cooperative = this.#wheelBehavior === "cooperative";
                    const ordinary = cooperative && !wheelEvent.ctrlKey;
                    if (
                        (!wheelEvent.deltaX && !wheelEvent.deltaY) ||
                        (ordinary && horizontal)
                    ) {
                        this.#stopWheelInteraction();
                        return;
                    }

                    // Resolve the consumer before cancelling the native source.
                    // Probes retain the source so authored filters see modifiers.
                    const probe = () =>
                        dispatchInteraction(point, {
                            type: "wheelclaimprobe",
                            sourceEvent: wheelEvent,
                            intent: ordinary
                                ? "scroll"
                                : cooperative
                                  ? "chart"
                                  : "default",
                        });
                    const claimed = probe();

                    if (claimed.wheelScroll) {
                        this.#stopWheelInteraction();
                        wheelEvent.preventDefault();
                        claimed.wheelScroll();
                        return;
                    } else if (ordinary) {
                        this.#stopWheelInteraction();
                        return;
                    }

                    if (!claimed.wheelClaimed) {
                        this.#stopWheelInteraction();
                        if (cooperative) {
                            return;
                        }
                    } else {
                        stopPanInertia(this.#animator);
                        if (this.#wheelOwner !== claimed.wheelOwner) {
                            this.#stopWheelInteraction();
                        }
                        this.#wheelOwner = claimed.wheelOwner;
                        wheelEvent.preventDefault();

                        if (!horizontal && claimed.wheelSmooth) {
                            const owner = claimed.wheelOwner;
                            const template = makeEventTemplate(wheelEvent);
                            this.#wheelInertia.setMomentum(
                                wheelEvent.deltaY *
                                    (wheelEvent.deltaMode ? 80 : 1),
                                (delta) => {
                                    const current = probe();
                                    if (
                                        !current.wheelClaimed ||
                                        current.wheelScroll ||
                                        current.wheelOwner !== owner ||
                                        !current.wheelSmooth
                                    ) {
                                        this.#stopWheelInteraction();
                                        return;
                                    }

                                    dispatchInteraction(
                                        point,
                                        new WheelEvent("wheel", {
                                            ...template,
                                            ctrlKey: wheelEvent.ctrlKey,
                                            deltaMode: 0,
                                            deltaX: 0,
                                            deltaY: delta,
                                        })
                                    );
                                }
                            );
                            return;
                        }
                    }

                    // Horizontal panning and selection-only gestures are direct.
                    this.#wheelInertia.stop();
                    if (horizontal) {
                        this.#clearHover();
                    }
                }

                if (type == "click") {
                    if (longPressTriggered) {
                        return;
                    }

                    const clickWasDrag =
                        this.#mouseDownCoords?.subtract(
                            Point.fromMouseEvent(event)
                        ).length >= 3;

                    const dispatchClick = () => {
                        // TODO: Should be handled at the view level, not globally
                        const e = this.#currentHover
                            ? {
                                  type,
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
                                  type,
                                  viewPath: null,
                                  datum: null,
                              };

                        this.#emitEvent("click", e);

                        if (!clickWasDrag) {
                            return dispatchInteraction(point, event, eventHit);
                        }
                    };

                    if (markPickPromise) {
                        dispatchPicked(markPickPromise, dispatchClick);
                        return;
                    }

                    return dispatchClick();
                }

                const dispatch = () => {
                    const interaction = dispatchInteraction(
                        point,
                        event,
                        eventHit
                    );
                    if (
                        type === "dblclick" &&
                        this.#hoverTrackingSuspensionCount === 0 &&
                        this.#isInsideCanvas(point)
                    ) {
                        this.#scheduleHoverRefreshAfterRender();
                    }
                    return interaction;
                };
                if (markPickPromise) {
                    dispatchPicked(markPickPromise, dispatch);
                    return;
                }
                return dispatch();
            }
        };

        /** @type {Map<number, PointerEvent>} */
        const touches = new Map();

        const readTouchGesture = () => {
            const points = touches.values();
            const first = points.next().value;
            if (!first) return;

            const second = points.next().value;
            return {
                pointerCount: /** @type {1 | 2} */ (second ? 2 : 1),
                centerX: second
                    ? (first.clientX + second.clientX) / 2
                    : first.clientX,
                centerY: second
                    ? (first.clientY + second.clientY) / 2
                    : first.clientY,
                distance: second ? getClientDistance(first, second) : 0,
            };
        };

        /**
         * @param {NonNullable<ReturnType<typeof readTouchGesture>>} gesture
         * @param {"move" | "end" | "cancel"} phase
         */
        const dispatchTouchGesture = (
            gesture,
            phase,
            xDelta = 0,
            yDelta = 0,
            zDelta = 0
        ) => {
            dispatchInteraction(
                toCanvasPoint(canvas, gesture.centerX, gesture.centerY),
                {
                    type: "touchgesture",
                    phase,
                    pointerCount: gesture.pointerCount,
                    xDelta,
                    yDelta,
                    zDelta,
                }
            );
        };

        /** @type {ReturnType<typeof readTouchGesture>} */
        let previousTouchGesture;

        /**
         * @param {PointerEvent} event
         * @param {boolean} canceled
         */
        const handleTouch = (event, canceled) => {
            const { type, pointerId } = event;
            const started = type === "pointerdown";
            const moved = type === "pointermove";
            if (!started && !touches.has(pointerId)) return;

            if (started) canvas.setPointerCapture(pointerId);
            if (started || moved) {
                this.#wheelInertia.cancel();
                touches.set(pointerId, event);
            } else {
                touches.delete(pointerId);
            }

            this.#tooltipUpdateRequested = false;
            const previous = previousTouchGesture;
            const current = readTouchGesture();
            previousTouchGesture = current;
            if (started) return;
            if (!moved) {
                if (canceled || !current) {
                    dispatchTouchGesture(previous, canceled ? "cancel" : "end");
                }
                return;
            }

            const xDelta = current.centerX - previous.centerX;
            const yDelta = current.centerY - previous.centerY;
            // The zoom handler converts the logarithmic delta to a scale factor.
            const zDelta =
                previous.distance > 0 && current.distance > 0
                    ? Math.log2(previous.distance / current.distance)
                    : 0;

            if (
                (xDelta !== 0 || yDelta !== 0 || zDelta !== 0) &&
                Number.isFinite(xDelta) &&
                Number.isFinite(yDelta) &&
                Number.isFinite(zDelta)
            ) {
                dispatchTouchGesture(previous, "move", xDelta, yDelta, zDelta);
            }
        };

        /** @param {PointerEvent} event */
        const startPress = (event) => {
            finishPress();
            this.#mouseDownCoords = Point.fromMouseEvent(event);
            this.#longPressPending = false;
            longPressTriggered = this.#tooltip.sticky;
            if (longPressTriggered) this.#dismissStickyTooltip();

            if (event.button === 2) {
                this.#tooltip.pushEnabledState(false);
                press = { id: event.pointerId, button: event.button };
            } else if (event.button === 0 && this.#tooltip.visible) {
                this.#longPressPending = true;
                const timer =
                    event.shiftKey || event.ctrlKey || event.metaKey
                        ? undefined
                        : setTimeout(() => {
                              longPressTriggered = true;
                              this.#longPressPending = false;
                              this.#tooltip.sticky = true;
                          }, 400);
                press = { id: event.pointerId, button: event.button, timer };
            }
        };

        /** @param {PointerEvent} event */
        const handlePointer = (event) => {
            const { type, pointerId, pointerType } = event;
            const touch = pointerType === "touch";
            const canceled =
                type === "pointercancel" || type === "lostpointercapture";
            if (type === "pointerdown") lastPressWasTouch = touch;
            if (canceled) finishPress(event);

            if (touch || (canceled && touches.has(pointerId))) {
                if (
                    canceled ||
                    type === "pointerdown" ||
                    type === "pointermove" ||
                    type === "pointerup"
                ) {
                    handleTouch(event, canceled);
                }
                return;
            }
            if (canceled) return;

            switch (type) {
                case "pointerdown":
                    startPress(event);
                    break;
                case "pointermove":
                case "pointerup": {
                    finishPress(event);
                    const point = this.#toCanvasPoint(event);
                    if (this.#isInsideCanvas(point)) listener(event, point);
                    return;
                }
                case "pointerleave":
                    finishPress(event);
                    break;
                case "pointerout":
                    if (this.#isInteractionFrozen()) return;
                    if (this.#hoverTrackingSuspensionCount > 0) {
                        this.#clearTooltip();
                        return;
                    }

                    this.#interactionDispatcher.handlePointerLeave(event);
                    this.#cursorManager.clear();
                    this.#tooltip.clear();
                    this.#clearHover();
                    this.#lastPointerPoint = undefined;
                    activeHoverPick = undefined;
                    queuedMouseMove = undefined;
                    return;
            }
            listener(event);
        };

        for (const type of aliasedPointerEventTypes) {
            canvas.addEventListener(type, handlePointer, options);
        }
        canvas.addEventListener("pointercancel", handlePointer, options);
        canvas.addEventListener("lostpointercapture", handlePointer, options);
        for (const type of ["click", "contextmenu", "dblclick"]) {
            canvas.addEventListener(type, listener, options);
        }
        canvas.addEventListener("wheel", listener, {
            ...options,
            passive: false,
        });
        canvas.addEventListener(
            "dragstart",
            (event) => event.stopPropagation(),
            options
        );

        if (globalThis.document?.addEventListener) {
            // A press can end outside the canvas without an active drag.
            const capture = { ...options, capture: true };
            document.addEventListener(
                "pointerdown",
                (event) => {
                    if (
                        this.#tooltip.sticky &&
                        !event.composedPath().includes(canvas) &&
                        !this.#tooltip.containsEvent(event)
                    ) {
                        this.#dismissStickyTooltip();
                    }
                },
                capture
            );
            document.addEventListener("pointerup", finishPress, capture);
            document.addEventListener("pointercancel", finishPress, capture);
        }

        return () => {
            listeners.abort();
            finishPress();
            for (const id of touches.keys()) {
                if (canvas.hasPointerCapture(id))
                    canvas.releasePointerCapture(id);
            }
            touches.clear();
            this.#stopWheelInteraction();
            this.#nativeEventListeners.clear();
            this.#markEventListeners.clear();
            this.#hoverListeners.clear();
        };
    }

    #stopWheelInteraction() {
        this.#wheelInertia.stop();
        this.#wheelOwner = undefined;
        stopPanInertia(this.#animator);
    }

    /**
     * @param {MouseEvent} event
     */
    #toCanvasPoint(event) {
        return toCanvasPoint(this.#canvas, event.clientX, event.clientY);
    }

    /**
     * @param {Point} point
     */
    #isInsideCanvas(point) {
        const canvas = this.#canvas;
        return (
            point.x >= 0 &&
            point.y >= 0 &&
            point.x <= canvas.clientWidth &&
            point.y <= canvas.clientHeight
        );
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
                this.#clearHover();
                this.#cursorManager.clear();
                return;
            }

            this.#clearTooltip();
            this.#refreshHoverAndCursor(point);
        });
    }

    #refreshHoverAndCursor(/** @type {Point} */ point) {
        if (!isStillZooming()) {
            this.#handlePicking(
                point.x,
                point.y,
                () =>
                    this.#hoverTrackingSuspensionCount === 0 &&
                    !this.#isInteractionFrozen() &&
                    this.#lastPointerPoint === point,
                () =>
                    this.#updateCursor(
                        this.#interactionDispatcher.getCurrentTarget()
                    )
            );
            return;
        }

        this.#updateCursor(this.#interactionDispatcher.getCurrentTarget());
    }

    /**
     * @param {import("../view/view.js").default | undefined} target
     */
    #updateCursor(target) {
        this.#cursorManager.update({
            target,
            hover: this.#currentHover,
        });
    }

    #clearTooltip() {
        this.#tooltip.clear();
        this.#tooltipUpdateRequested = false;
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
     * @param {() => boolean} [shouldApply]
     * @param {(hit: InternalMarkHit | undefined) => void} [onApplied]
     * @param {Promise<void>} [after] Prior discrete interaction must finish before publishing this pick.
     * @returns {Promise<boolean> | undefined}
     */
    #handlePicking(x, y, shouldApply = () => true, onApplied, after) {
        const requestId = this.#pickingRequestId;
        this.#renderPickingFramebuffer();
        const result = this.#readPickingId?.(x, y) ?? 0;

        /** @param {number | null} uniqueId */
        const applyResult = (uniqueId) => {
            if (requestId !== this.#pickingRequestId || !shouldApply()) {
                return false;
            }

            this.#tooltipUpdateRequested = false;
            const hit = this.#findHit(x, y, uniqueId ?? 0);
            this.#applyPickingResult(requestId, hit);
            onApplied?.(hit);
            return true;
        };

        if (result instanceof Promise || after) {
            const ready = after
                ? Promise.all([after, result]).then(([, id]) => id)
                : Promise.resolve(result);
            return ready.then(applyResult, (error) => {
                console.error("Picking failed.", error);
                return false;
            });
        }
        applyResult(result);
    }

    /**
     * @param {number} requestId
     * @param {InternalMarkHit | undefined} [hit]
     */
    #applyPickingResult(requestId, hit) {
        this.#currentHoverRequestId = requestId;
        this.#replaceHover(hit ?? null);

        if (this.#currentHover) {
            const hover = this.#currentHover;
            const mark = hover.mark;
            this.updateTooltip(
                hover.datum,
                async (datum) => {
                    if (!mark.isPickingParticipant()) {
                        return;
                    }

                    const tooltipProps = mark.properties.tooltip;

                    if (tooltipProps !== null && tooltipProps !== false) {
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
                            tooltipProps?.params,
                            hover.facetId
                        );
                        return handler(
                            datum,
                            mark,
                            tooltipProps?.params,
                            context
                        );
                    }
                },
                hover
            );
        }
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {number} uniqueId
     * @param {import("../view/view.js").default} [scopeView]
     * @returns {InternalMarkHit | undefined}
     */
    #findHit(x, y, uniqueId, scopeView) {
        if (uniqueId === 0) {
            return;
        }

        /** @type {InternalMarkHit | undefined} */
        let hit;
        let hitWithinBounds = false;
        this.#viewRoot.visit((view) => {
            if (
                view instanceof UnitView &&
                view.mark.isPickingParticipant() &&
                (!scopeView || view.getLayoutAncestors().includes(scopeView))
            ) {
                for (const [facetId, coords] of view.facetCoords) {
                    // Only facet operators establish cell identity by bounds.
                    const cellFacetId =
                        facetId !== undefined &&
                        view
                            .getLayoutAncestors()
                            .some((ancestor) => isFacetSpec(ancestor.spec))
                            ? facetId
                            : undefined;
                    const withinBounds = coords.containsPoint(x, y);
                    const clip = view.mark.properties.clip;
                    const outsideClip =
                        clip === true ||
                        (clip === "x" && (x < coords.x || x > coords.x2)) ||
                        (clip === "y" && (y < coords.y || y > coords.y2));
                    // Prefer the owning plot when views share the same record IDs.
                    if (
                        !withinBounds &&
                        (cellFacetId !== undefined ||
                            hitWithinBounds ||
                            outsideClip)
                    ) {
                        continue;
                    }
                    const datum = view
                        .getCollector()
                        ?.findDatumByUniqueId(uniqueId);
                    if (datum) {
                        hit = {
                            mark: view.mark,
                            datum,
                            uniqueId,
                            ...(cellFacetId === undefined
                                ? {}
                                : { facetId: cellFacetId }),
                        };
                        hitWithinBounds = withinBounds;
                    }
                    break;
                }
            }
            if (hitWithinBounds) {
                return VISIT_STOP;
            }
        });
        return hit;
    }

    /**
     * @param {MouseEvent} sourceEvent
     * @param {Point} point
     * @param {InternalMarkHit | undefined} hit
     */
    #emitMarkEvent(sourceEvent, point, hit) {
        if (!hit) {
            return;
        }

        for (const entry of [...this.#markEventListeners]) {
            if (
                entry.type === sourceEvent.type &&
                hit.mark.unitView.getLayoutAncestors().includes(entry.view)
            ) {
                try {
                    const result = entry.listener({ sourceEvent, point, hit });
                    if (result instanceof Promise) {
                        void result.catch(this.#reportError);
                    }
                } catch (error) {
                    this.#reportError(error);
                }
            }
        }
    }

    /**
     * @param {import("../view/view.js").default} view
     * @returns {InternalMarkHit | undefined}
     */
    #getScopedHover(view) {
        const hit = this.#currentHover;
        return hit &&
            this.#currentHoverRequestId === this.#pickingRequestId &&
            hit.mark.isPickingParticipant() &&
            hit.mark.unitView.getLayoutAncestors().includes(view)
            ? hit
            : undefined;
    }

    /**
     * @param {InternalMarkHit | null | undefined} hover
     */
    #replaceHover(hover) {
        const previousHover = this.#currentHover;
        if (
            (!previousHover && !hover) ||
            (previousHover &&
                hover &&
                previousHover.mark === hover.mark &&
                previousHover.uniqueId === hover.uniqueId &&
                previousHover.datum === hover.datum &&
                (previousHover.facetId === hover.facetId ||
                    (previousHover.facetId &&
                        hover.facetId &&
                        shallowArrayEquals(
                            previousHover.facetId,
                            hover.facetId
                        ))))
        ) {
            return;
        }
        this.#currentHover = hover;
        // TODO: Consider comparing previous and next hits within each listener's
        // scope, so hover changes entirely outside it do not emit undefined again.
        for (const entry of [...this.#hoverListeners]) {
            try {
                entry.listener(this.#getScopedHover(entry.view));
            } catch (error) {
                this.#reportError(error);
            }
        }
    }

    #clearHover() {
        this.#replaceHover(null);
    }

    /**
     * This method should be called in a mouseMove handler. If not called, the
     * tooltip will be hidden.
     *
     * @param {T} datum
     * @param {function(T):Promise<string | HTMLElement | import("lit").TemplateResult>} [converter]
     * @param {unknown} [identity] Distinguishes repeated occurrences of a datum.
     * @template T
     */
    updateTooltip(datum, converter, identity = datum) {
        if (this.#suppressTooltipUntilMouseMove) {
            return;
        }

        if (!this.#tooltipUpdateRequested || !datum) {
            this.#tooltip.updateWithDatum(datum, converter, identity);
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
 * @param {HTMLCanvasElement} canvas
 * @param {number} clientX
 * @param {number} clientY
 */
function toCanvasPoint(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return new Point(
        clientX - rect.left - canvas.clientLeft,
        clientY - rect.top - canvas.clientTop
    );
}
