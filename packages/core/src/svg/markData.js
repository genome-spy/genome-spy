import { getMarkData } from "../rendering/cpu/markData.js";

/**
 * Selects the collector batch that corresponds to the rendered occurrence.
 *
 * @param {import("../marks/mark.js").default} mark
 * @param {import("../types/rendering.js").RenderingOptions} options
 * @returns {object[]}
 */
export function getSvgData(mark, options) {
    return getMarkData(mark, options);
}
