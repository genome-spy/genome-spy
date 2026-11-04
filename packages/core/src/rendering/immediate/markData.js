import Rectangle from "../../view/layout/rectangle.js";

/** @type {object[]} */
const EMPTY_DATA = [];
const AXES = /** @type {const} */ (["x", "y"]);

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
 */
export function visitMarkOccurrences(
    mark,
    options,
    coords,
    sampleFacetCoords,
    visitor
) {
    const data = getMarkData(mark, options);
    const occurrenceCoords = options.sampleFacetRenderingOptions
        ? sampleFacetCoords.resolveFacet(
              coords,
              options.sampleFacetRenderingOptions
          )
        : coords;
    if (isOccurrenceVisible(mark, occurrenceCoords)) {
        visitor(occurrenceCoords, data);
    }
}

/** @param {import("../../marks/mark.js").default} mark
 * @param {Rectangle} coords
 */
function isOccurrenceVisible(mark, coords) {
    if (mark.properties.clamp && coords.height <= 0) return false;
    for (const axis of AXES) {
        const scale = mark.encoders[axis]?.scale;
        if (scale && "gapMapping" in scale) {
            const extent = axis === "x" ? coords.width : coords.height;
            if (scale.gapMapping(extent)?.fits === false) return false;
        }
    }
    return true;
}
