import { renderPointCanvas } from "./point.js";
import { renderRectCanvas } from "./rect.js";

/**
 * @typedef {object} CanvasMarkRenderingOptions
 * @prop {CanvasRenderingContext2D} context
 * @prop {import("../../view/layout/rectangle.js").default} coords
 * @prop {object[]} data
 * @prop {import("../../svg/svgBounds.js").SvgBounds} visibleBounds
 * @prop {import("../../svg/svgBounds.js").SvgBounds} anchorCullBounds
 * @prop {number} viewOpacity
 * @prop {(message: string) => void} warn
 */

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {CanvasMarkRenderingOptions} options
 */
export function renderMarkCanvas(mark, options) {
    if (mark.getType() == "rect") {
        return renderRectCanvas(mark, options);
    } else if (mark.getType() == "point") {
        return renderPointCanvas(mark, options);
    } else {
        options.warn(
            `Canvas2D rendering is not implemented for mark type "${mark.getType()}".`
        );
        return 0;
    }
}
