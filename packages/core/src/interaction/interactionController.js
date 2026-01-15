import UnitView from "../view/unitView.js";
import { VISIT_STOP } from "../view/view.js";
import { readPickingPixel } from "../gl/webGLHelper.js";
import InteractionEvent from "../utils/interactionEvent.js";
import Inertia, { makeEventTemplate } from "../utils/inertia.js";
import Point from "../view/layout/point.js";
import { isStillZooming } from "../view/zoom.js";

export default class InteractionController {
    /**
     * @param {object} options
     * @param {import("../view/view.js").default} options.viewRoot
     * @param {import("../gl/webGLHelper.js").default} options.glHelper
     * @param {import("../utils/ui/tooltip.js").default} options.tooltip
     * @param {import("../utils/animator.js").default} options.animator
     * @param {Map<string, Set<(event: any) => void>>} options.eventListeners
     * @param {Record<string, import("../tooltip/tooltipHandler.js").TooltipHandler>} options.tooltipHandlers
     * @param {() => void} options.renderPickingFramebuffer
     * @param {() => number} options.getDevicePixelRatio
     */
    constructor({
        viewRoot,
        glHelper,
        tooltip,
        animator,
        eventListeners,
        tooltipHandlers,
        renderPickingFramebuffer,
        getDevicePixelRatio,
    }) {
        this._viewRoot = viewRoot;
        this._glHelper = glHelper;
        this._tooltip = tooltip;
        this._animator = animator;
        this._eventListeners = eventListeners;
        this._tooltipHandlers = tooltipHandlers;
        this._renderPickingFramebuffer = renderPickingFramebuffer;
        this._getDevicePixelRatio = getDevicePixelRatio;

        /**
         * Currently hovered mark and datum
         * @type {{ mark: import("../marks/mark.js").default, datum: import("../data/flowNode.js").Datum, uniqueId: number }}
         */
        this._currentHover = undefined;

        this._wheelInertia = new Inertia(this._animator);

        /** @type {Point} */
        this._mouseDownCoords = undefined;

        this._tooltipUpdateRequested = false;
    }

    getCurrentHover() {
        return this._currentHover;
    }

    registerMouseEvents() {
        const canvas = this._glHelper.canvas;

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
                    this._tooltip.handleMouseMove(event);
                    this._tooltipUpdateRequested = false;

                    // Disable picking during dragging. Also postpone picking until
                    // the user has stopped zooming as reading pixels from the
                    // picking buffer is slow and ruins smooth animations.
                    if (event.buttons == 0 && !isStillZooming()) {
                        this._renderPickingFramebuffer();
                        this._handlePicking(point.x, point.y);
                    }
                }

                /**
                 * @param {MouseEvent} dispatchedEvent
                 */
                const dispatchEvent = (dispatchedEvent) => {
                    this._viewRoot.propagateInteractionEvent(
                        new InteractionEvent(point, dispatchedEvent)
                    );

                    if (!this._tooltipUpdateRequested) {
                        this._tooltip.clear();
                    }
                };

                if (event.type != "wheel") {
                    this._wheelInertia.cancel();
                }

                if (
                    (event.type == "mousedown" || event.type == "mouseup") &&
                    !isStillZooming()
                ) {
                    // Actually, only needed when clicking on a mark
                    this._renderPickingFramebuffer();
                } else if (event.type == "wheel") {
                    lastWheelEvent = now;
                    this._tooltipUpdateRequested = false;

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
                        this._currentHover = null;

                        this._wheelInertia.cancel();
                    } else {
                        // Vertical wheeling zooms.
                        // We use inertia to generate fake wheel events for smoother zooming

                        const template = makeEventTemplate(wheelEvent);

                        this._wheelInertia.setMomentum(
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

                    const e = this._currentHover
                        ? {
                              type: event.type,
                              viewPath: this._currentHover.mark.unitView
                                  .getLayoutAncestors()
                                  .map((view) => view.name)
                                  .reverse(),
                              datum: this._currentHover.datum,
                          }
                        : {
                              type: event.type,
                              viewPath: null,
                              datum: null,
                          };

                    this._eventListeners
                        .get("click")
                        ?.forEach((listener) => listener(e));
                }

                if (
                    event.type != "click" ||
                    // Suppress click events if the mouse has been dragged
                    this._mouseDownCoords?.subtract(Point.fromMouseEvent(event))
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
            this._mouseDownCoords = Point.fromMouseEvent(e);
            if (this._tooltip.sticky) {
                this._tooltip.sticky = false;
                this._tooltip.clear();
                // A hack to prevent selection if the tooltip is sticky.
                // Let the tooltip be destickified first.
                longPressTriggered = true;
            } else {
                longPressTriggered = false;
            }

            const disableTooltip = () => {
                document.addEventListener(
                    "mouseup",
                    () => this._tooltip.popEnabledState(),
                    { once: true }
                );
                this._tooltip.pushEnabledState(false);
            };

            // Opening context menu or using modifier keys disables the tooltip
            if (e.button == 2 || e.shiftKey || e.ctrlKey || e.metaKey) {
                disableTooltip();
            } else if (this._tooltip.visible) {
                // Make tooltip sticky if the user long-presses
                const timeout = setTimeout(() => {
                    longPressTriggered = true;
                    this._tooltip.sticky = true;
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
            this._tooltip.clear();
            this._currentHover = null;
        });
    }

    /**
     * @param {number} x
     * @param {number} y
     */
    _handlePicking(x, y) {
        const dpr = this._getDevicePixelRatio();
        const pp = readPickingPixel(
            this._glHelper.gl,
            this._glHelper._pickingBufferInfo,
            x * dpr,
            y * dpr
        );

        const uniqueId = pp[0] | (pp[1] << 8) | (pp[2] << 16) | (pp[3] << 24);

        if (uniqueId == 0) {
            this._currentHover = null;
            return;
        }

        if (uniqueId !== this._currentHover?.uniqueId) {
            this._currentHover = null;
        }

        if (!this._currentHover) {
            this._viewRoot.visit((view) => {
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
                            this._currentHover = {
                                mark: view.mark,
                                datum,
                                uniqueId,
                            };
                        }
                    }
                    if (this._currentHover) {
                        return VISIT_STOP;
                    }
                }
            });
        }

        if (this._currentHover) {
            const mark = this._currentHover.mark;
            this.updateTooltip(this._currentHover.datum, async (datum) => {
                if (!mark.isPickingParticipant()) {
                    return;
                }

                const tooltipProps = mark.properties.tooltip;

                if (tooltipProps !== null) {
                    const handlerName = tooltipProps?.handler ?? "default";
                    const handler = this._tooltipHandlers[handlerName];
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
        if (!this._tooltipUpdateRequested || !datum) {
            this._tooltip.updateWithDatum(datum, converter);
            this._tooltipUpdateRequested = true;
        } else {
            throw new Error(
                "Tooltip has already been updated! Duplicate event handler?"
            );
        }
    }
}
