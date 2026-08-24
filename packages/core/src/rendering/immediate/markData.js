/** @type {object[]} */
const EMPTY_DATA = [];

/**
 * Selects the collector batch that corresponds to the rendered occurrence.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {import("../../types/rendering.js").RenderingOptions} options
 * @returns {object[]}
 */
export function getMarkData(mark, options) {
    const collector = mark.unitView.getCollector();
    if (!collector) {
        throw new Error(
            `Cannot render an uninitialized mark. View: ${mark.unitView.getPathString()}`
        );
    }

    const unFacetedData = collector.facetBatches.get(undefined);
    if (unFacetedData?.length) {
        return unFacetedData;
    }

    return collector.facetBatches.get(options.facetId) ?? EMPTY_DATA;
}

/**
 * Visits the data and coordinates for each rendered occurrence of a mark.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {import("../../types/rendering.js").RenderingOptions} options
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {(coords: import("../../view/layout/rectangle.js").default, data: object[]) => void} visitor
 * @param {(facetIndex: number) => void} onMissingFacet
 */
export function visitMarkOccurrences(
    mark,
    options,
    coords,
    visitor,
    onMissingFacet
) {
    const data = getMarkData(mark, options);
    if (options.sampleFacetRenderingOptions) {
        visitor(
            getSampleFacetCoords(coords, options.sampleFacetRenderingOptions),
            data
        );
    } else if (mark.encoders.facetIndex) {
        for (const [facetIndex, facetData] of groupDataByFacetIndex(
            mark.encoders.facetIndex,
            data
        )) {
            const locSize = getPlacementPosition(
                options.placement?.source,
                facetIndex
            );
            if (locSize) {
                visitor(
                    getSampleFacetCoords(coords, {
                        locSize,
                        pixelToUnit: 1,
                    }),
                    facetData
                );
            } else {
                onMissingFacet(facetIndex);
            }
        }
    } else {
        visitor(coords, data);
    }
}

/**
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {import("../../types/rendering.js").SampleFacetRenderingOptions} facet
 */
function getSampleFacetCoords(coords, facet) {
    const location = facet.locSize.location * facet.pixelToUnit;
    const size = facet.locSize.size * facet.pixelToUnit;
    return coords.modify({
        y: () => coords.y + location * coords.height,
        height: () => size * coords.height,
    });
}

/**
 * @param {import("../../view/layout/placementSource.js").default | undefined} source
 * @param {number} index
 * @returns {import("../../view/layout/flexLayout.js").LocSize | undefined}
 */
function getPlacementPosition(source, index) {
    if (!source) {
        return undefined;
    }
    const rectangles = source.getSnapshot().rectangles;
    const offset = index * 4;
    if (offset + 3 < rectangles.length) {
        return {
            location: rectangles[offset + 1],
            size: rectangles[offset + 3],
        };
    }
}

/**
 * @param {import("../../types/encoder.js").Encoder} facetIndexEncoder
 * @param {object[]} data
 * @returns {Map<number, object[]>}
 */
function groupDataByFacetIndex(facetIndexEncoder, data) {
    /** @type {Map<number, object[]>} */
    const facets = new Map();
    for (const datum of data) {
        const index = +facetIndexEncoder(datum);
        let facet = facets.get(index);
        if (!facet) {
            facet = [];
            facets.set(index, facet);
        }
        facet.push(datum);
    }
    return facets;
}
