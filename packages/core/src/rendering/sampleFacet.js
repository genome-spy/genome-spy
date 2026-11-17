/**
 * Tests whether a positive-height sample facet overlaps its viewport. Exact
 * edge contact remains visible.
 *
 * @param {import("../types/rendering.js").SampleFacetRenderingOptions} facet
 * @returns {boolean}
 */
export function isSampleFacetVisible(facet) {
    const scale = facet.pixelToUnit;
    const position = facet.locSize.location * scale;
    const height = facet.locSize.size * scale;
    return !(height <= 0 || position > 1 || position + height < 0);
}
