import Rectangle from "../../view/layout/rectangle.js";

/** @type {object[]} */
const EMPTY_DATA = [];

/**
 * Reuses one materialized rectangle while visiting mark occurrences. Rendering
 * contexts own an instance for one synchronous rendering pass.
 */
export class SampleFacetCoordsResolver {
    #values = { x: 0, y: 0, width: 0, height: 0 };

    #coords = new Rectangle(
        () => this.#values.x,
        () => this.#values.y,
        () => this.#values.width,
        () => this.#values.height
    );

    /** @type {Rectangle | undefined} */
    #sourceCoords;

    #sourceY = 0;

    #sourceHeight = 0;

    #location = NaN;

    #size = NaN;

    #pixelToUnit = NaN;

    /**
     * Materializes explicit sample coordinates once for consecutive marks in
     * the same sample occurrence.
     *
     * @param {Rectangle} coords
     * @param {import("../../types/rendering.js").SampleFacetRenderingOptions} facet
     * @returns {Rectangle}
     */
    resolveFacet(coords, facet) {
        this.#resolveSource(coords);
        const location = facet.locSize.location;
        const size = facet.locSize.size;
        if (
            this.#location !== location ||
            this.#size !== size ||
            this.#pixelToUnit !== facet.pixelToUnit
        ) {
            this.#resolveFacet(location, size, facet.pixelToUnit);
            this.#location = location;
            this.#size = size;
            this.#pixelToUnit = facet.pixelToUnit;
        }
        return this.#coords;
    }

    /**
     * Resolves placement-backed coordinates without allocating an intermediate
     * location object.
     *
     * @param {Rectangle} coords
     * @param {import("../../view/layout/placementSource.js").default | undefined} source
     * @param {number} index
     * @returns {Rectangle | undefined}
     */
    resolvePlacement(coords, source, index) {
        if (!source) {
            return undefined;
        }
        const rectangles = source.getSnapshot().rectangles;
        const offset = index * 4;
        if (offset + 3 >= rectangles.length) {
            return undefined;
        }

        this.#resolveSource(coords);
        this.#resolveFacet(rectangles[offset + 1], rectangles[offset + 3], 1);
        this.#location = NaN;
        this.#size = NaN;
        this.#pixelToUnit = NaN;
        return this.#coords;
    }

    /**
     * @param {Rectangle} coords
     */
    #resolveSource(coords) {
        if (this.#sourceCoords === coords) {
            return;
        }
        this.#values.x = coords.x;
        this.#sourceY = coords.y;
        this.#values.width = coords.width;
        this.#sourceHeight = coords.height;
        this.#sourceCoords = coords;
        this.#location = NaN;
        this.#size = NaN;
        this.#pixelToUnit = NaN;
    }

    /**
     * @param {number} location
     * @param {number} size
     * @param {number} pixelToUnit
     */
    #resolveFacet(location, size, pixelToUnit) {
        this.#values.y =
            this.#sourceY + location * pixelToUnit * this.#sourceHeight;
        this.#values.height = size * pixelToUnit * this.#sourceHeight;
    }
}

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
 * Visits the data and coordinates for each rendered occurrence of a mark. The
 * visitor must consume the coordinates synchronously and must not retain them.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {import("../../types/rendering.js").RenderingOptions} options
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {SampleFacetCoordsResolver} sampleFacetCoords
 * @param {(coords: import("../../view/layout/rectangle.js").default, data: object[]) => void} visitor
 * @param {(facetIndex: number) => void} onMissingFacet
 */
export function visitMarkOccurrences(
    mark,
    options,
    coords,
    sampleFacetCoords,
    visitor,
    onMissingFacet
) {
    const data = getMarkData(mark, options);
    if (options.sampleFacetRenderingOptions) {
        visitor(
            sampleFacetCoords.resolveFacet(
                coords,
                options.sampleFacetRenderingOptions
            ),
            data
        );
    } else if (mark.encoders.facetIndex) {
        for (const [facetIndex, facetData] of groupDataByFacetIndex(
            mark.encoders.facetIndex,
            data
        )) {
            const occurrenceCoords = sampleFacetCoords.resolvePlacement(
                coords,
                options.placement?.source,
                facetIndex
            );
            if (occurrenceCoords) {
                visitor(occurrenceCoords, facetData);
            } else {
                onMissingFacet(facetIndex);
            }
        }
    } else {
        visitor(coords, data);
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
