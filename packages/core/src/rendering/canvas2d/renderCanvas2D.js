import Rectangle from "../../view/layout/rectangle.js";
import Canvas2DViewRenderingContext from "./canvas2DViewRenderingContext.js";

/**
 * Runs one immediate Canvas2D view traversal.
 *
 * @param {object} options
 * @param {import("../../view/view.js").default} options.viewRoot
 * @param {CanvasRenderingContext2D} options.context
 * @param {number} options.width
 * @param {number} options.height
 * @param {number} options.devicePixelRatio
 * @param {string | null} options.background
 * @param {boolean} options.paint
 */
export default function renderCanvas2D(options) {
    const renderingContext = new Canvas2DViewRenderingContext(
        { picking: false },
        options
    );
    options.viewRoot.render(
        renderingContext,
        Rectangle.create(0, 0, options.width, options.height),
        { firstFacet: true }
    );
}
