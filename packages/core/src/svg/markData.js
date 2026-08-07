/** @type {object[]} */
const EMPTY_DATA = [];

/**
 * Selects the collector batch that corresponds to the rendered occurrence.
 *
 * @param {import("../marks/mark.js").default} mark
 * @param {import("../types/rendering.js").RenderingOptions} options
 * @returns {object[]}
 */
export function getSvgData(mark, options) {
    const collector = mark.unitView.getCollector();
    if (!collector) {
        throw new Error(
            `Cannot export an uninitialized mark as SVG. View: ${mark.unitView.getPathString()}`
        );
    }

    const unFacetedData = collector.facetBatches.get(undefined);
    if (unFacetedData?.length) {
        return unFacetedData;
    }

    return collector.facetBatches.get(options.facetId) ?? EMPTY_DATA;
}
