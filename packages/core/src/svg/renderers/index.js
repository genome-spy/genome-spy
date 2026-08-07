import { renderArrowSvg } from "./arrow.js";
import { renderLinkSvg } from "./link.js";
import { renderPointSvg } from "./point.js";
import { renderRectSvg } from "./rect.js";
import { renderRuleSvg } from "./rule.js";
import { renderTextSvg } from "./text.js";
import { renderLegendGradientSvg } from "../legendGradient.js";

const renderers = new Map([
    ["arrow", renderArrowSvg],
    ["link", renderLinkSvg],
    ["point", renderPointSvg],
    ["rect", renderRectSvg],
    ["rule", renderRuleSvg],
    ["text", renderTextSvg],
    ["tick", renderRuleSvg],
]);

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {import("../svgViewRenderingContext.js").SvgMarkRenderingOptions} options
 */
export function renderMarkSvg(mark, options) {
    if (mark.getType() == "rect" && renderLegendGradientSvg(mark, options)) {
        return;
    }

    const renderer = renderers.get(mark.getType());
    if (!renderer) {
        throw new Error(
            `SVG rendering is not implemented for mark type "${mark.getType()}". View: ${mark.unitView.getPathString()}`
        );
    }
    renderer(mark, options);
}
