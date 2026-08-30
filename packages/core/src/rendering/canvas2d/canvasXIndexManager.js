import { getPerformanceProfiler } from "../../debug/performanceProfiler.js";
import {
    createMarkXIndexSpec,
    resolveMarkXIndexQuery,
} from "../xIndex/markXIndex.js";
import { XRangeIndexBuilder } from "../xIndex/xRangeIndex.js";

export const CanvasXIndexFallbackReason = Object.freeze({
    NONE: 0,
    FACET_INDEX: 1,
    INELIGIBLE: 2,
    REJECTED_BUILD: 3,
    UNBOUNDED_QUERY: 4,
});

/**
 * Owns source-row x indexes shared by live Canvas rendering and picking.
 */
export default class CanvasXIndexManager {
    /** @type {WeakMap<import("../../marks/mark.js").default, MarkCacheEntry>} */
    #marks = new WeakMap();

    /** @type {[number, number]} */
    #queryDomain = [0, 0];

    /** @type {MarkCacheEntry | undefined} */
    #preparedEntry;

    /** @type {number} */
    #lastFallbackReason = CanvasXIndexFallbackReason.NONE;

    /**
     * Prepares eligibility and the live query envelope once for a mark replay.
     *
     * @param {import("../../marks/mark.js").default} mark
     * @returns {boolean}
     */
    prepare(mark) {
        this.#preparedEntry = undefined;
        if (mark.encoders.facetIndex) {
            return this.#fallback(CanvasXIndexFallbackReason.FACET_INDEX);
        }

        const collector = mark.unitView.getCollector();
        let markEntry = this.#marks.get(mark);
        if (
            !markEntry ||
            markEntry.collector !== collector ||
            markEntry.dataRevision !== collector.dataRevision ||
            markEntry.xEncoder !== mark.encoders.x ||
            markEntry.x2Encoder !== mark.encoders.x2
        ) {
            const spec = createMarkXIndexSpec(mark);
            markEntry = {
                collector,
                dataRevision: collector.dataRevision,
                xEncoder: mark.encoders.x,
                x2Encoder: mark.encoders.x2,
                spec,
                batches: new WeakMap(),
            };
            this.#marks.set(mark, markEntry);
        }

        const spec = markEntry.spec;
        if (!spec) {
            return this.#fallback(CanvasXIndexFallbackReason.INELIGIBLE);
        }
        if (!resolveMarkXIndexQuery(mark, spec, this.#queryDomain)) {
            return this.#fallback(CanvasXIndexFallbackReason.UNBOUNDED_QUERY);
        }

        this.#preparedEntry = markEntry;
        this.#lastFallbackReason = CanvasXIndexFallbackReason.NONE;
        return true;
    }

    /**
     * Writes the candidate source-row range for the prepared mark.
     *
     * @param {object[]} data
     * @param {[number, number]} target
     * @returns {boolean}
     */
    query(data, target) {
        const markEntry = this.#preparedEntry;
        if (!markEntry?.spec) {
            throw new Error("Canvas x-index query was not prepared.");
        }

        const profiler = getPerformanceProfiler();
        profiler?.addCount("canvasXIndexNativeItems", data.length);

        let batch = markEntry.batches.get(data);
        if (!batch) {
            const index = buildSourceRowIndex(markEntry.spec, data) ?? null;
            batch = {
                index,
                queryStart: NaN,
                queryEnd: NaN,
                start: 0,
                end: 0,
            };
            markEntry.batches.set(data, batch);
            profiler?.addCount("canvasXIndexBuilds");
            if (!index) {
                profiler?.addCount("canvasXIndexRejectedBuilds");
            }
        }
        if (!batch.index) {
            return this.#fallback(CanvasXIndexFallbackReason.REJECTED_BUILD);
        }

        const queryStart = this.#queryDomain[0];
        const queryEnd = this.#queryDomain[1];
        if (batch.queryStart !== queryStart || batch.queryEnd !== queryEnd) {
            batch.index.query(queryStart, queryEnd, target);
            batch.queryStart = queryStart;
            batch.queryEnd = queryEnd;
            batch.start = target[0];
            batch.end = target[1];
        } else {
            target[0] = batch.start;
            target[1] = batch.end;
        }

        this.#lastFallbackReason = CanvasXIndexFallbackReason.NONE;
        profiler?.addCount("canvasXIndexQueries");
        profiler?.addCount("canvasXIndexCandidateItems", target[1] - target[0]);
        if (target[0] === target[1]) {
            profiler?.addCount("canvasXIndexEmptyRanges");
        }
        return true;
    }

    getLastFallbackReason() {
        return this.#lastFallbackReason;
    }

    /** @param {number} reason */
    #fallback(reason) {
        this.#lastFallbackReason = reason;
        getPerformanceProfiler()?.addCount("canvasXIndexFallbackQueries");
        return false;
    }
}

/**
 * @param {import("../xIndex/markXIndex.js").MarkXIndexSpec} spec
 * @param {object[]} data
 */
function buildSourceRowIndex(spec, data) {
    const binCount = Math.min(
        256,
        Math.max(1, Math.ceil(Math.sqrt(data.length)))
    );
    const builder = new XRangeIndexBuilder(spec.indexDomain, binCount);
    const x = spec.xAccessor;
    const x2 = spec.x2Accessor ?? x;
    for (let i = 0; i < data.length; i++) {
        const datum = data[i];
        builder.add(x(datum), x2(datum), i, i + 1);
    }
    return builder.finish();
}

/**
 * @typedef {object} MarkCacheEntry
 * @property {import("../../data/collector.js").default} collector
 * @property {number} dataRevision
 * @property {import("../../types/encoder.js").Encoder | undefined} xEncoder
 * @property {import("../../types/encoder.js").Encoder | undefined} x2Encoder
 * @property {import("../xIndex/markXIndex.js").MarkXIndexSpec | undefined} spec
 * @property {WeakMap<object[], BatchCacheEntry>} batches
 */

/**
 * @typedef {object} BatchCacheEntry
 * @property {import("../xIndex/xRangeIndex.js").XRangeIndex | null} index
 * @property {number} queryStart
 * @property {number} queryEnd
 * @property {number} start
 * @property {number} end
 */
