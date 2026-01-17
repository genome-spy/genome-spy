import clamp from "../../utils/clamp.js";
import { makeLerpSmoother } from "../../utils/animator.js";
import Rectangle from "../layout/rectangle.js";
import UnitView from "../unitView.js";

/**
 * This class represents a scrollbar thumb that can be used within a grid view
 * to provide scrolling functionality for overflowing content.
 *
 * @typedef {"horizontal" | "vertical"} ScrollDirection
 */
export default class Scrollbar extends UnitView {
    /** @type {ScrollDirection} */
    #scrollDirection;

    // NOTE: Keep this Rectangle instance stable. Buffered rendering caches
    // a reference to coords; replacing it breaks dynamic updates.
    #scrollbarCoords = Rectangle.ZERO;

    #viewportCoords = Rectangle.ZERO;

    #contentCoords = Rectangle.ZERO;

    /**
     * The actual state of the scrollbar.
     *
     * It's better to keep track of the viewport offset rather than the
     * scrollbar offset because the former is more stable when the
     * viewport size changes.
     */
    viewportOffset = 0;

    /** @type {(offset: number) => void} */
    #onViewportOffsetChange;

    /**
     * @param {import("./gridChild.js").default} gridChild
     * @param {ScrollDirection} scrollDirection
     * @param {{ onViewportOffsetChange?: (offset: number) => void }} [options]
     */
    constructor(gridChild, scrollDirection, options = {}) {
        // TODO: Configurable
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
                ],
                data: { values: [{}] },
                mark: {
                    type: "rect",
                    fill: "#b0b0b0",
                    fillOpacity: 0.6,
                    opacity: { expr: "scrollbarOpacity" },
                    stroke: "white",
                    strokeWidth: 1,
                    strokeOpacity: 1,
                    cornerRadius: 5,
                    clip: false,
                },
                configurableVisibility: false,
            },
            gridChild.layoutParent.context,
            gridChild.layoutParent,
            gridChild.view,
            "scrollbar-" + scrollDirection, // TODO: Serial
            {
                blockEncodingInheritance: true,
            }
        );

        this.config = config;
        this.#scrollDirection = scrollDirection;
        this.#onViewportOffsetChange = options.onViewportOffsetChange;

        const sPad = this.config.scrollbarPadding;
        const sSize = this.config.scrollbarSize;

        this.#scrollbarCoords =
            this.#scrollDirection == "vertical"
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

        // Make it smooth!
        this.interpolateViewportOffset = makeLerpSmoother(
            this.context.animator,
            (value) => {
                this.setViewportOffset(value.x, { notify: true });
            },
            50,
            0.4,
            { x: this.viewportOffset }
        );

        this.addInteractionEventListener("mousedown", (coords, event) => {
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

            const onMouseup = () => {
                document.removeEventListener("mousemove", onMousemove);
                document.removeEventListener("mouseup", onMouseup);
            };

            document.addEventListener("mouseup", onMouseup, false);
            document.addEventListener("mousemove", onMousemove, false);
        });
    }

    get scrollOffset() {
        return this.#getScrollOffsetFromViewportOffset(this.viewportOffset);
    }

    /**
     * @param {number} value
     * @param {{ notify?: boolean }} [options]
     */
    setViewportOffset(value, { notify = true } = {}) {
        this.viewportOffset = clamp(value, 0, this.#getMaxViewportOffset());

        if (notify && this.#onViewportOffsetChange) {
            this.#onViewportOffsetChange(this.viewportOffset);
        }
    }

    #getVisibleFraction() {
        const dimension =
            this.#scrollDirection == "horizontal" ? "width" : "height";

        const viewportSize = this.#viewportCoords[dimension];
        const contentSize = this.#contentCoords[dimension];

        return contentSize > 0 ? Math.min(1, viewportSize / contentSize) : 1;
    }

    #getMaxScrollLength() {
        const dimension =
            this.#scrollDirection == "horizontal" ? "width" : "height";

        return Math.max(
            0,
            this.#viewportCoords[dimension] - 2 * this.config.scrollbarPadding
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
        const dimension =
            this.#scrollDirection == "horizontal" ? "width" : "height";

        return Math.max(
            0,
            this.#contentCoords[dimension] - this.#viewportCoords[dimension]
        );
    }

    /**
     * @param {import("../renderingContext/viewRenderingContext.js").default} context
     * @param {import("../layout/rectangle.js").default} coords
     * @param {import("../../types/rendering.js").RenderingOptions} [options]
     */
    render(context, coords, options) {
        // NOTE: this only builds the layout, doesn't actually render anything
        super.render(context, this.#scrollbarCoords, options);
    }

    /**
     * Updates the scrollbar with new dynamic coordinate rectangles.
     *
     * Note: This method should be only called during the layout phase
     * triggered by "requestLayoutReflow". When the view is actually rendered
     * based on the layout, `#scrollbarCoords` magically contains the correct
     * coordinates.
     *
     * TODO: This should be refactored so that "coords", the content, is treated
     * as fully dynamic, meaning that if the content's size changes, the scrollbar
     * updates accordingly—particularly its length.
     *
     * TODO: Implement a minimum scrollbar thumb size, e.g., 20px.
     *
     * @param {Rectangle} viewportCoords
     * @param {Rectangle} contentCoords
     */
    updateScrollbar(viewportCoords, contentCoords) {
        this.#viewportCoords = viewportCoords.flatten();
        this.#contentCoords = contentCoords;
        this.setViewportOffset(this.viewportOffset, { notify: false });
    }
}
