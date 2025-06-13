import clamp from "../../utils/clamp.js";
import { makeLerpSmoother } from "../../utils/animator.js";
import Rectangle from "../layout/rectangle.js";
import UnitView from "../unitView.js";

/**
 * @typedef {"horizontal" | "vertical"} ScrollDirection
 */
export default class Scrollbar extends UnitView {
    /** @type {ScrollDirection} */
    #scrollDirection;

    #scrollbarCoords = Rectangle.ZERO;

    #maxScrollOffset = 0;

    #maxViewportOffset = 0;

    // This is the actual state of the scrollbar. It's better to keep track of
    // the viewport offset rather than the scrollbar offset because the former
    // is more stable when the viewport size changes.
    viewportOffset = 0;

    /**
     * @param {import("./gridChild.js").default} gridChild
     * @param {ScrollDirection} scrollDirection
     */
    constructor(gridChild, scrollDirection) {
        // TODO: Configurable
        const config = {
            scrollbarSize: 8,
            scrollbarPadding: 2,
            // TODO: inside/outside view
        };

        super(
            {
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

        // Make it smooth!
        this.interpolateViewportOffset = makeLerpSmoother(
            this.context.animator,
            (value) => {
                this.viewportOffset = value.x;
            },
            50,
            0.4,
            { x: this.viewportOffset }
        );

        this.addInteractionEventListener("mousedown", (coords, event) => {
            event.stopPropagation();

            if (this.#maxScrollOffset <= 0) {
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
                const scrollOffset = clamp(
                    getMouseOffset(moveEvent) -
                        initialOffset +
                        initialScrollOffset,
                    0,
                    this.#maxScrollOffset
                );

                this.interpolateViewportOffset({
                    x:
                        (scrollOffset / this.#maxScrollOffset) *
                        this.#maxViewportOffset,
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
        return (
            (this.viewportOffset / this.#maxViewportOffset) *
            this.#maxScrollOffset
        );
    }

    /**
     * @param {import("../renderingContext/viewRenderingContext.js").default} context
     * @param {import("../layout/rectangle.js").default} coords
     * @param {import("../../types/rendering.js").RenderingOptions} [options]
     */
    render(context, coords, options) {
        super.render(context, this.#scrollbarCoords, options);
    }

    /**
     *
     * @param {Rectangle} viewportCoords
     * @param {Rectangle} coords
     */
    updateScrollbar(viewportCoords, coords) {
        const sPad = this.config.scrollbarPadding;
        const sSize = this.config.scrollbarSize;

        const dimension =
            this.#scrollDirection == "horizontal" ? "width" : "height";

        const visibleFraction = Math.min(
            1,
            viewportCoords[dimension] / coords[dimension]
        );
        const maxScrollLength = viewportCoords[dimension] - 2 * sPad;
        const scrollLength = visibleFraction * maxScrollLength;

        this.#maxScrollOffset = maxScrollLength - scrollLength;
        this.#maxViewportOffset = coords[dimension] - viewportCoords[dimension];
        this.viewportOffset = clamp(
            this.viewportOffset,
            0,
            this.#maxViewportOffset
        );

        this.#scrollbarCoords =
            this.#scrollDirection == "vertical"
                ? new Rectangle(
                      () =>
                          viewportCoords.x +
                          viewportCoords.width -
                          sSize -
                          sPad,
                      () => viewportCoords.y + sPad + this.scrollOffset,
                      () => sSize,
                      () => scrollLength
                  )
                : new Rectangle(
                      () => viewportCoords.x + sPad + this.scrollOffset,
                      () =>
                          viewportCoords.y +
                          viewportCoords.height -
                          sSize -
                          sPad,
                      () => scrollLength,
                      () => sSize
                  );
    }
}
