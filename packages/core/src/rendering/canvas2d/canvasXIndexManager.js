import { countPerformance } from "../../debug/performanceProfiler.js";
import {
    buildMarkXIndex,
    createMarkXIndexSpec,
    resolveMarkXIndexQuery,
} from "../xIndex/markXIndex.js";

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

    /**
     * Prepares eligibility and the live query envelope once for a mark replay.
     *
     * @param {import("../../marks/mark.js").default} mark
     * @returns {boolean}
     */
    prepare(mark) {
        this.#preparedEntry = undefined;
        if (mark.encoders.facetIndex) {
            return this.#fallback();
        }

        const collector = mark.unitView.getCollector();
        const xScaleResolution = mark.unitView.getScaleResolution("x");
        const xIndexDomain = xScaleResolution?.zoomExtent;
        let markEntry = this.#marks.get(mark);
        if (
            !markEntry ||
            markEntry.collector !== collector ||
            markEntry.dataRevision !== collector.dataRevision ||
            markEntry.xEncoder !== mark.encoders.x ||
            markEntry.x2Encoder !== mark.encoders.x2 ||
            markEntry.xScaleResolution !== xScaleResolution ||
            markEntry.xIndexDomainStart !== xIndexDomain?.[0] ||
            markEntry.xIndexDomainEnd !== xIndexDomain?.[1]
        ) {
            const spec = createMarkXIndexSpec(mark);
            markEntry = {
                collector,
                dataRevision: collector.dataRevision,
                xEncoder: mark.encoders.x,
                x2Encoder: mark.encoders.x2,
                xScaleResolution,
                xIndexDomainStart: xIndexDomain?.[0],
                xIndexDomainEnd: xIndexDomain?.[1],
                spec,
                batches: new WeakMap(),
            };
            this.#marks.set(mark, markEntry);
        }

        const spec = markEntry.spec;
        if (!spec) {
            return this.#fallback();
        }
        if (!resolveMarkXIndexQuery(mark, spec, this.#queryDomain)) {
            return this.#fallback();
        }

        this.#preparedEntry = markEntry;
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

        countPerformance("canvasXIndexNativeItems", data.length);

        let batch = markEntry.batches.get(data);
        if (!batch) {
            const index = buildMarkXIndex(markEntry.spec, data) ?? null;
            batch = { index };
            markEntry.batches.set(data, batch);
            countPerformance("canvasXIndexBuilds");
            if (!index) {
                countPerformance("canvasXIndexRejectedBuilds");
            }
        }
        if (!batch.index) {
            return this.#fallback();
        }

        batch.index(this.#queryDomain[0], this.#queryDomain[1], target);

        countPerformance("canvasXIndexQueries");
        countPerformance("canvasXIndexCandidateItems", target[1] - target[0]);
        if (target[0] === target[1]) {
            countPerformance("canvasXIndexEmptyRanges");
        }
        return true;
    }

    #fallback() {
        countPerformance("canvasXIndexFallbackQueries");
        return false;
    }
}

/**
 * @typedef {object} MarkCacheEntry
 * @property {import("../../data/collector.js").default} collector
 * @property {number} dataRevision
 * @property {import("../../types/encoder.js").Encoder | undefined} xEncoder
 * @property {import("../../types/encoder.js").Encoder | undefined} x2Encoder
 * @property {import("../../scales/scaleResolution.js").default | undefined} xScaleResolution
 * @property {number | undefined} xIndexDomainStart
 * @property {number | undefined} xIndexDomainEnd
 * @property {import("../xIndex/markXIndex.js").MarkXIndexSpec | undefined} spec
 * @property {WeakMap<object[], BatchCacheEntry>} batches
 */

/**
 * @typedef {object} BatchCacheEntry
 * @property {import("../../utils/binnedIndex.js").Lookup | null} index
 */
