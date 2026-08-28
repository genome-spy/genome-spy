import Canvas2DViewRenderingContext from "./canvas2DViewRenderingContext.js";

/**
 * Draws one completed layout into a Canvas2D context.
 *
 * @param {object} options
 * @param {import("../../view/layout/layoutResult.js").default} options.layoutResult
 * @param {CanvasRenderingContext2D} options.context
 * @param {number} options.width
 * @param {number} options.height
 * @param {number} options.devicePixelRatio
 * @param {string | null} options.background
 * @param {boolean} options.paint
 * @param {(mark: import("../../marks/mark.js").default) => boolean} [options.markPredicate]
 */
export default function renderCanvas2D(options) {
    const renderingContext = new Canvas2DViewRenderingContext(
        { picking: false },
        options
    );
    options.layoutResult.collectRenderCommands(renderingContext);
}
