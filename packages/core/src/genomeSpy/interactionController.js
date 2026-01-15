import UnitView from "../view/unitView.js";
import { VISIT_STOP } from "../view/view.js";
import { readPickingPixel } from "../gl/webGLHelper.js";
import InteractionEvent from "../utils/interactionEvent.js";
import Inertia, { makeEventTemplate } from "../utils/inertia.js";
import Point from "../view/layout/point.js";
import { isStillZooming } from "../view/zoom.js";

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
    /**
     * @type {{ mark: import("../marks/mark.js").default, datum: import("../data/flowNode.js").Datum, uniqueId: number }}
     */
    #currentHover;
    /** @type {Inertia} */
    #wheelInertia;
    /** @type {Point} */
    #mouseDownCoords;
    /** @type {boolean} */
    #tooltipUpdateRequested;
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

        /**
         * Currently hovered mark and datum
         * @type {{ mark: import("../marks/mark.js").default, datum: import("../data/flowNode.js").Datum, uniqueId: number }}
         */
        this.#currentHover = undefined;

        this.#wheelInertia = new Inertia(this.#animator);

        /** @type {Point} */
        this.#mouseDownCoords = undefined;

        this.#tooltipUpdateRequested = false;
    }

    getCurrentHover() {
        return this.#currentHover;
    }

    registerMouseEvents() {
        const canvas = this.#glHelper.canvas;

        let lastWheelEvent = performance.now();
        let longPressTriggered = false;

        /** @param {Event} event */
        const listener = (event) => {
            const now = performance.now();
            const wheeling = now - lastWheelEvent < 200;

            if (event instanceof MouseEvent) {
                const rect = canvas.getBoundingClientRect();
                const point = new Point(
                    event.clientX - rect.left - canvas.clientLeft,
                    event.clientY - rect.top - canvas.clientTop
                );

                if (event.type == "mousemove" && !wheeling) {
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
                    this.#viewRoot.propagateInteractionEvent(
                        new InteractionEvent(point, dispatchedEvent)
                    );

                    if (!this.#tooltipUpdateRequested) {
                        this.#tooltip.clear();
                    }
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
                        // Vertical wheeling zooms.
                        // We use inertia to generate fake wheel events for smoother zooming

                        const template = makeEventTemplate(wheelEvent);

                        this.#wheelInertia.setMomentum(
                            wheelEvent.deltaY * (wheelEvent.deltaMode ? 80 : 1),
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
                    dispatchEvent(event);
                }
            }
        };

        [
            "mousedown",
            "mouseup",
            "wheel",
            "click",
            "mousemove",
            "gesturechange",
            "contextmenu",
            "dblclick",
        ].forEach((type) => canvas.addEventListener(type, listener));

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

        canvas.addEventListener("mouseout", () => {
            this.#tooltip.clear();
            this.#currentHover = null;
        });
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

                    return handler(datum, mark, tooltipProps?.params);
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
