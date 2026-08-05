import Rectangle from "../view/layout/rectangle.js";
import SvgViewRenderingContext from "../view/renderingContext/svgViewRenderingContext.js";

/**
 * Creates an SVG document by traversing a prepared view hierarchy.
 *
 * @param {object} options
 * @param {import("../view/view.js").default} options.viewRoot
 * @param {number} options.logicalWidth
 * @param {number} options.logicalHeight
 * @param {string | null} [options.background]
 * @returns {SVGSVGElement}
 */
export function createSvg({
    viewRoot,
    logicalWidth,
    logicalHeight,
    background = "white",
}) {
    const renderingContext = new SvgViewRenderingContext(
        { picking: false },
        {
            width: logicalWidth,
            height: logicalHeight,
            background,
        }
    );

    viewRoot.render(
        renderingContext,
        Rectangle.create(0, 0, logicalWidth, logicalHeight),
        { firstFacet: true }
    );

    return renderingContext.getSvg();
}
