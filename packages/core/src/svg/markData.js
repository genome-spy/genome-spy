/**
 * Selects the collector batch that corresponds to the rendered occurrence.
 *
 * @param {import("../marks/mark.js").default} mark
 * @param {import("../types/rendering.js").RenderingOptions} options
 * @returns {object[]}
 */
export function getSvgData(mark, options) {
    if (options.sampleFacetRenderingOptions) {
        throw new Error("SVG export does not support sample facets yet.");
    }

    const collector = mark.unitView.getCollector();
    if (!collector) {
        throw new Error(
            `Cannot export an uninitialized mark as SVG. View: ${mark.unitView.getPathString()}`
        );
    }

    const unFacetedData = collector.facetBatches.get(undefined);
    if (unFacetedData) {
        return unFacetedData;
    }

    const data = collector.facetBatches.get(options.facetId);
    if (!data) {
        throw new Error(
            `Cannot find SVG export data for facet ${JSON.stringify(options.facetId)}. View: ${mark.unitView.getPathString()}`
        );
    }
    return data;
}
