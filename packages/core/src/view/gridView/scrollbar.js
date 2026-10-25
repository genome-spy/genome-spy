import clamp from "../../utils/clamp.js";
import { makeLerpSmoother } from "../../utils/animator.js";
import { startDocumentDrag } from "../../utils/documentDrag.js";
import Rectangle from "../layout/rectangle.js";
import UnitView from "../unitView.js";
import { markViewAsNonAddressable } from "../viewSelectors.js";
import { normalizeWheelScrollDelta } from "../../utils/interactionEvent.js";

/**
 * This class represents a scrollbar thumb that can be used within a grid view
 * to provide scrolling functionality for overflowing content.
 *
 * @typedef {"horizontal" | "vertical"} ScrollDirection
 */
export default class Scrollbar extends UnitView {
    /** @type {"width" | "height"} */
    #dimension;

    // NOTE: Keep this Rectangle instance stable. Buffered rendering caches
    // a reference to coords; replacing it breaks dynamic updates.
    #scrollbarCoords = Rectangle.ZERO;

    #viewportCoords = Rectangle.ZERO;

    #contentCoords = Rectangle.ZERO;

    // Distance from the authored edge survives content and viewport size changes.
    #anchorDistance = 0;

    /** @type {"start" | "end"} */
    #anchor;

    #smootherMaxOffset = 0;

    /** @type {(offset: number) => void} */
    #onViewportOffsetChange;

    /** @type {() => boolean} */
    #cancelActiveDrag = () => false;

    /**
     * @param {import("./gridChild.js").default} gridChild
     * @param {ScrollDirection} scrollDirection
     * @param {{ anchor?: "start" | "end", onViewportOffsetChange?: (offset: number) => void }} [options]
     */
    constructor(gridChild, scrollDirection, options = {}) {
        // TODO: Configurable per view
        const config = {
            scrollbarSize: 8,
            scrollbarPadding: 2,
            scrollbarMinLength: 20,
        };

        super(
            {
                params: [
                    {
                        name: "scrollbarOpacity",
                        value: 1,
                    },
                    {
                        name: "scrollbarVisible",
                        value: false,
                    },
                ],
                opacity: { expr: "scrollbarVisible ? scrollbarOpacity : 0" },
                data: { values: [{}] },
                mark: {
                    type: "rect",
                    fill: "#b0b0b0",
                    fillOpacity: 0.6,
                    stroke: "white",
                    strokeWidth: 1,
                    strokeOpacity: 1,
                    cornerRadius: 5,
                    clip: false,
                },
            },
            gridChild.layoutParent.context,
            gridChild.layoutParent,
            gridChild.view,
            "scrollbar-" + scrollDirection, // TODO: Serial
            { chrome: true }
        );

        markViewAsNonAddressable(this, { skipSubtree: true });

        this.config = config;
        this.#dimension = scrollDirection === "horizontal" ? "width" : "height";
        this.#anchor = options.anchor ?? "start";
        this.#onViewportOffsetChange = options.onViewportOffsetChange;

        const sPad = this.config.scrollbarPadding;
        const sSize = this.config.scrollbarSize;

        this.#scrollbarCoords =
            scrollDirection == "vertical"
                ? new Rectangle(
                      () =>
                          this.#viewportCoords.x +
                          this.#viewportCoords.width -
                          sSize -
                          sPad,
                      () => this.#viewportCoords.y + sPad + this.scrollOffset,
                      () => sSize,
                      () => this.#getScrollLength()
                  )
                : new Rectangle(
                      () => this.#viewportCoords.x + sPad + this.scrollOffset,
                      () =>
                          this.#viewportCoords.y +
                          this.#viewportCoords.height -
                          sSize -
                          sPad,
                      () => this.#getScrollLength(),
                      () => sSize
                  );

        this.interpolateViewportOffset = this.#createOffsetSmoother();
        this.registerDisposer(() => {
            this.#cancelActiveDrag();
            this.interpolateViewportOffset.stop();
        });

        this.addInteractionListener("mousedown", (event) => {
            event.stopPropagation();

            if (this.#getMaxScrollOffset() <= 0) {
                return;
            }

            const getMouseOffset = (/** @type {MouseEvent} */ mouseEvent) =>
                scrollDirection == "vertical"
                    ? mouseEvent.clientY
                    : mouseEvent.clientX;

            event.mouseEvent.preventDefault();
            const initialScrollOffset = this.scrollOffset;
            const initialOffset = getMouseOffset(event.mouseEvent);

            const onMousemove = /** @param {MouseEvent} moveEvent */ (
                moveEvent
            ) => {
                const maxScrollOffset = this.#getMaxScrollOffset();
                if (maxScrollOffset <= 0) {
                    return;
                }

                const scrollOffset = clamp(
                    getMouseOffset(moveEvent) -
                        initialOffset +
                        initialScrollOffset,
                    0,
                    maxScrollOffset
                );

                this.interpolateViewportOffset({
                    x: this.#getViewportOffsetFromScrollOffset(scrollOffset),
                });
            };

            this.#cancelActiveDrag = startDocumentDrag({
                onMove: onMousemove,
                hoverContext: this.context,
            });
        });
    }

    get viewportOffset() {
        return this.#convertOffset(this.#anchorDistance);
    }

    /** Signed content translation also aligns content that fits inside the viewport. */
    get contentTranslation() {
        const alignment =
            this.#anchor === "end"
                ? Math.max(
                      0,
                      this.#viewportCoords[this.#dimension] -
                          this.#contentCoords[this.#dimension]
                  )
                : 0;
        return alignment - this.viewportOffset;
    }

    get scrollOffset() {
        return this.#getScrollOffsetFromViewportOffset(this.viewportOffset);
    }

    /**
     * Whether the content overflows the viewport, i.e. there is something to
     * scroll. Scrollbars exist whenever a viewport size is given, even if the
     * content fits.
     */
    canScroll() {
        return this.#getMaxViewportOffset() > 0;
    }

    /**
     * @param {import("../../utils/interactionEvent.js").WheelLikeEvent} event
     * @returns {(() => void) | undefined}
     */
    getWheelScroll(event) {
        const delta = normalizeWheelScrollDelta(
            event,
            this.#viewportCoords.height
        );
        const next = clamp(
            this.viewportOffset + delta,
            0,
            this.#getMaxViewportOffset()
        );
        if (next === this.viewportOffset) {
            return;
        }

        return () => {
            this.interpolateViewportOffset.stop();
            this.setViewportOffset(next, { syncSmoother: true });
            this.context.animator.requestRender();
        };
    }

    /**
     * @param {number} value
     * @param {{ notify?: boolean, syncSmoother?: boolean }} [options]
     */
    setViewportOffset(value, { notify = true, syncSmoother = false } = {}) {
        const distance = this.#convertOffset(value);
        const changed = distance !== this.#anchorDistance;
        this.#anchorDistance = distance;

        // App sample views publish their current offset every frame. Preserve an
        // active target unless the owner changes that offset or its scroll range.
        if (
            syncSmoother &&
            (changed ||
                this.#smootherMaxOffset !== this.#getMaxViewportOffset())
        ) {
            this.interpolateViewportOffset.stop();
            this.interpolateViewportOffset = this.#createOffsetSmoother();
        }

        if (notify && this.#onViewportOffsetChange) {
            this.#onViewportOffsetChange(this.viewportOffset);
        }
    }

    /**
     * Conversion is symmetric between physical offsets and edge-relative distances.
     * @param {number} value
     */
    #convertOffset(value) {
        const max = this.#getMaxViewportOffset();
        const clamped = clamp(value, 0, max);
        return this.#anchor === "end" ? max - clamped : clamped;
    }

    #getVisibleFraction() {
        const viewportSize = this.#viewportCoords[this.#dimension];
        const contentSize = this.#contentCoords[this.#dimension];

        return contentSize > 0 ? Math.min(1, viewportSize / contentSize) : 1;
    }

    #getMaxScrollLength() {
        return Math.max(
            0,
            this.#viewportCoords[this.#dimension] -
                2 * this.config.scrollbarPadding
        );
    }

    #getScrollLength() {
        const maxScrollLength = this.#getMaxScrollLength();
        const scrollLength = this.#getVisibleFraction() * maxScrollLength;
        const minLength = this.config.scrollbarMinLength;

        return Math.min(maxScrollLength, Math.max(minLength, scrollLength));
    }

    #getMaxScrollOffset() {
        return Math.max(
            0,
            this.#getMaxScrollLength() - this.#getScrollLength()
        );
    }

    /**
     * @param {number} viewportOffset
     */
    #getScrollOffsetFromViewportOffset(viewportOffset) {
        const maxViewportOffset = this.#getMaxViewportOffset();
        const maxScrollOffset = this.#getMaxScrollOffset();

        if (maxViewportOffset <= 0 || maxScrollOffset <= 0) {
            return 0;
        }

        return (viewportOffset / maxViewportOffset) * maxScrollOffset;
    }

    /**
     * @param {number} scrollOffset
     */
    #getViewportOffsetFromScrollOffset(scrollOffset) {
        const maxViewportOffset = this.#getMaxViewportOffset();
        const maxScrollOffset = this.#getMaxScrollOffset();

        if (maxViewportOffset <= 0 || maxScrollOffset <= 0) {
            return 0;
        }

        return (scrollOffset / maxScrollOffset) * maxViewportOffset;
    }

    #getMaxViewportOffset() {
        return Math.max(
            0,
            this.#contentCoords[this.#dimension] -
                this.#viewportCoords[this.#dimension]
        );
    }

    /**
     * @param {import("../renderingContext/viewRenderingContext.js").default} context
     * @param {import("../layout/rectangle.js").default} coords
     * @param {import("../../types/rendering.js").RenderingOptions} [options]
     */
    arrange(context, coords, options) {
        // NOTE: This only records layout coordinates for buffered rendering.
        super.arrange(context, this.#scrollbarCoords, options);
    }

    /**
     * Updates the scrollbar with the latest viewport and content rectangles.
     *
     * Viewport coords are flattened to stay stable between layout passes, while
     * content coords may be dynamic (e.g., peek transitions) and are evaluated
     * on demand via accessors.
     *
     * @param {Rectangle} viewportCoords
     * @param {Rectangle} contentCoords
     */
    updateScrollbar(viewportCoords, contentCoords) {
        this.#viewportCoords = viewportCoords.flatten();
        this.#contentCoords = contentCoords;
        this.paramRuntime.setValue("scrollbarVisible", this.canScroll());

        this.setViewportOffset(this.viewportOffset, {
            notify: false,
            syncSmoother: true,
        });
    }

    #createOffsetSmoother() {
        this.#smootherMaxOffset = this.#getMaxViewportOffset();
        return makeLerpSmoother(
            this.context.animator,
            (current) => this.setViewportOffset(current.x),
            35,
            0.4,
            { x: this.viewportOffset }
        );
    }
}
