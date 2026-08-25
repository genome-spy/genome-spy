import { getMarkData } from "../immediate/markData.js";

/** @type {WeakMap<import("../../marks/mark.js").default, PackedMarkData>} */
const PACKED_DATA_CACHE = new WeakMap();

/**
 * Packs a collector once in either its native batch order or the complete
 * placement topology order. Active occurrences never define packed topology.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {import("../../view/layout/placementSource.js").default} [placementSource]
 * @returns {PackedMarkData}
 */
export function getPackedMarkData(mark, placementSource) {
    const collector = mark.unitView.getCollector();
    if (!collector) {
        throw new Error(
            `Cannot render an uninitialized mark. View: ${mark.unitView.getPathString()}`
        );
    }

    const topology = placementSource?.getSnapshot().topology;
    const cached = PACKED_DATA_CACHE.get(mark);
    if (
        cached?.collector === collector &&
        cached.revision === collector.dataRevision &&
        cached.topology === topology
    ) {
        return cached;
    }

    const unFaceted = collector.facetBatches.get(undefined);
    /** @type {Map<object[], {firstInstance: number, instanceCount: number}>} */
    const ranges = new Map();
    /** @type {{firstInstance: number, instanceCount: number}[] | undefined} */
    let placementRanges;
    /** @type {object[]} */
    let data;

    if (unFaceted?.length) {
        data = unFaceted;
        ranges.set(unFaceted, {
            firstInstance: 0,
            instanceCount: data.length,
        });
    } else {
        const batches = topology
            ? topology.facetIds.map((facetId) =>
                  facetId
                      ? (collector.facetBatches.get(
                            /** @type {any} */ (facetId)
                        ) ?? [])
                      : []
              )
            : Array.from(collector.facetBatches.values());
        data = new Array(
            batches.reduce((total, batch) => total + batch.length, 0)
        );
        if (topology) {
            placementRanges = [];
        }
        let dataIndex = 0;
        for (const batch of batches) {
            const range = {
                firstInstance: dataIndex,
                instanceCount: batch.length,
            };
            placementRanges?.push(range);
            ranges.set(batch, range);
            for (const datum of batch) {
                data[dataIndex++] = datum;
            }
        }
    }

    const packed = {
        collector,
        revision: collector.dataRevision,
        topology,
        data,
        ranges,
        placementRanges,
    };
    PACKED_DATA_CACHE.set(mark, packed);
    return packed;
}

/**
 * Resolves an occurrence range when packed data changes.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {import("../../types/rendering.js").RenderingOptions} options
 * @param {PackedMarkData} packed
 */
export function getPackedMarkRange(mark, options, packed) {
    const placementIndex = options.placement?.index;
    return (
        (placementIndex === undefined
            ? undefined
            : packed.placementRanges?.[placementIndex]) ??
        packed.ranges.get(getMarkData(mark, options)) ?? {
            firstInstance: 0,
            instanceCount: 0,
        }
    );
}

/**
 * @typedef {object} PackedMarkData
 * @property {import("../../data/collector.js").default} collector
 * @property {number} revision
 * @property {object | undefined} topology
 * @property {object[]} data
 * @property {Map<object[], {firstInstance: number, instanceCount: number}>} ranges
 * @property {{firstInstance: number, instanceCount: number}[] | undefined} placementRanges
 */
