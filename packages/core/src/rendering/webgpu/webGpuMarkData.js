import { getMarkData } from "../immediate/markData.js";
import { countPerformance } from "../../debug/performanceProfiler.js";
import { buildMarkXIndex, createMarkXIndexSpec } from "../xIndex/markXIndex.js";

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
    const xEncoder = mark.encoders?.x;
    const x2Encoder = mark.encoders?.x2;
    const xScaleResolution = xEncoder
        ? mark.unitView.getScaleResolution("x")
        : undefined;
    const xIndexDomain = xScaleResolution?.zoomExtent;
    const cached = PACKED_DATA_CACHE.get(mark);
    if (
        cached?.collector === collector &&
        cached.revision === collector.dataRevision &&
        cached.topology === topology &&
        cached.xEncoder === xEncoder &&
        cached.x2Encoder === x2Encoder &&
        cached.xScaleResolution === xScaleResolution &&
        cached.xIndexDomainStart === xIndexDomain?.[0] &&
        cached.xIndexDomainEnd === xIndexDomain?.[1]
    ) {
        return cached;
    }

    const unFaceted = collector.facetBatches.get(undefined);
    const xIndexSpec = createMarkXIndexSpec(mark);
    /** @type {Map<object[], PackedMarkRange>} */
    const ranges = new Map();
    /** @type {PackedMarkRange[] | undefined} */
    let placementRanges;
    /** @type {Uint32Array | undefined} */
    let placementIndices;
    /** @type {object[]} */
    let data;

    if (unFaceted?.length) {
        data = unFaceted;
        ranges.set(unFaceted, createPackedRange(xIndexSpec, data, 0));
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
            placementIndices = new Uint32Array(data.length);
        }
        let dataIndex = 0;
        for (
            let placementIndex = 0;
            placementIndex < batches.length;
            placementIndex++
        ) {
            const batch = batches[placementIndex];
            const range = createPackedRange(xIndexSpec, batch, dataIndex);
            placementRanges?.push(range);
            ranges.set(batch, range);
            for (const datum of batch) {
                if (placementIndices) {
                    placementIndices[dataIndex] = placementIndex;
                }
                data[dataIndex++] = datum;
            }
        }
    }

    const packed = {
        collector,
        revision: collector.dataRevision,
        topology,
        xEncoder,
        x2Encoder,
        xScaleResolution,
        xIndexDomainStart: xIndexDomain?.[0],
        xIndexDomainEnd: xIndexDomain?.[1],
        xIndexSpec,
        data,
        ranges,
        placementRanges,
        placementIndices,
    };
    PACKED_DATA_CACHE.set(mark, packed);
    return packed;
}

/**
 * @param {import("../xIndex/markXIndex.js").MarkXIndexSpec | undefined} spec
 * @param {object[]} data
 * @param {number} firstInstance
 * @returns {PackedMarkRange}
 */
function createPackedRange(spec, data, firstInstance) {
    /** @type {PackedMarkRange} */
    const range = {
        firstInstance,
        instanceCount: data.length,
    };
    if (!spec || !data.length) {
        return range;
    }

    countPerformance("webgpuXIndexBuilds");
    const xIndex = buildMarkXIndex(spec, data, firstInstance);
    if (!xIndex) {
        countPerformance("webgpuXIndexRejectedBuilds");
        return range;
    }
    range.xIndex = xIndex;
    return range;
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
 * @property {import("../../types/encoder.js").Encoder | undefined} xEncoder
 * @property {import("../../types/encoder.js").Encoder | undefined} x2Encoder
 * @property {import("../../scales/scaleResolution.js").default | undefined} xScaleResolution
 * @property {number | undefined} xIndexDomainStart
 * @property {number | undefined} xIndexDomainEnd
 * @property {import("../xIndex/markXIndex.js").MarkXIndexSpec | undefined} xIndexSpec
 * @property {object[]} data
 * @property {Map<object[], PackedMarkRange>} ranges
 * @property {PackedMarkRange[] | undefined} placementRanges
 * @property {Uint32Array | undefined} placementIndices
 */

/**
 * @typedef {object} PackedMarkRange
 * @property {number} firstInstance
 * @property {number} instanceCount
 * @property {import("../../utils/binnedIndex.js").Lookup} [xIndex]
 */
