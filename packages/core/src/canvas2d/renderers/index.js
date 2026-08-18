import { renderArrowCanvas } from "./arrow.js";
import { renderLinkCanvas } from "./link.js";
import { renderPointCanvas } from "./point.js";
import { renderRectCanvas } from "./rect.js";
import { renderRuleCanvas } from "./rule.js";
import { renderTextCanvas } from "./text.js";

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
    if (mark.getType() == "arrow") {
        return renderArrowCanvas(mark, options);
    } else if (mark.getType() == "link") {
        return renderLinkCanvas(mark, options);
    } else if (mark.getType() == "rect") {
        return renderRectCanvas(mark, options);
    } else if (mark.getType() == "point") {
        return renderPointCanvas(mark, options);
    } else if (mark.getType() == "rule" || mark.getType() == "tick") {
        return renderRuleCanvas(mark, options);
    } else if (mark.getType() == "text") {
        return renderTextCanvas(mark, options);
    } else {
        options.warn(
            `Canvas2D rendering is not implemented for mark type "${mark.getType()}".`
        );
        return 0;
    }
}
