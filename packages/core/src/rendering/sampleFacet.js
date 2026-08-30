/**
 * Tests the normalized vertical interval of an explicit sample facet. Exact
 * edge contact remains visible.
 *
 * @param {import("../types/rendering.js").SampleFacetRenderingOptions} facet
 * @returns {boolean}
 */
export function isSampleFacetVisible(facet) {
    const scale = facet.pixelToUnit;
    const position = facet.locSize.location * scale;
    const height = facet.locSize.size * scale;
    return !(position > 1 || position + height < 0);
}
