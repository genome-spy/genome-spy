/**
 * Tests the normalized vertical interval of an explicit sample facet. Exact
 * edge contact remains visible, matching the buffered WebGL renderer.
 *
 * @param {import("../types/rendering.js").RenderingOptions} options
 * @returns {boolean}
 */
export function isSampleFacetVisible(options) {
    const facet = options.sampleFacetRenderingOptions;
    if (!facet) {
        return true;
    }

    const scale = facet.pixelToUnit;
    const position = facet.locSize.location * scale;
    const height = facet.locSize.size * scale;
    return !(position > 1 || position + height < 0);
}
