import { describe, expect, test, vi } from "vitest";
import Genome from "../../../genome/genome.js";
import Collector from "../../collector.js";
import SingleAxisWindowedSource from "./singleAxisWindowedSource.js";

const genome = new Genome({
    name: "test",
    contigs: [
        { name: "chr1", size: 10 },
        { name: "chr2", size: 20 },
        { name: "chr3", size: 30 },
    ],
});

/**
 * @typedef {import("../../../view/view.js").default & {
 *     setDomain: (newDomain: number[]) => void
 * }} WindowedViewStub
 */

class TestWindowedSource extends SingleAxisWindowedSource {
    constructor() {
        super(createViewStub(), "x");
    }

    /**
     * @param {number[]} interval
     * @param {Parameters<SingleAxisWindowedSource["discretizeAndLoad"]>[1]} loader
     */
    discretize(interval, loader) {
        return this.discretizeAndLoad(interval, loader);
    }
}

class RepropagatingWindowedSource extends SingleAxisWindowedSource {
    /** @type {number[][]} */
    loadedIntervals = [];

    /**
     * @param {ReturnType<typeof createViewStub>} view
     */
    constructor(view) {
        super(view, "x");
        this.params = { windowSize: 20 };
    }

    /**
     * @param {number[]} interval
     */
    async loadInterval(interval) {
        this.loadedIntervals.push(interval);
        this.publishData([[{ interval: interval.join("-") }]]);
    }

    markUnavailable() {
        this._lastLoadedDomain = undefined;
    }
}

/** @returns {WindowedViewStub} */
function createViewStub() {
    /** @type {number[]} */
    let domain = [0, genome.totalSize];
    const scaleResolution = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getDomain: () => domain,
        getScale: () => ({
            genome: () => genome,
        }),
    };

    return /** @type {WindowedViewStub} */ (
        /** @type {any} */ ({
            context: {
                addBroadcastListener: vi.fn(),
                removeBroadcastListener: vi.fn(),
                dataFlow: {
                    loadingStatusRegistry: {
                        set: vi.fn(),
                    },
                },
            },
            getScaleResolution: () => scaleResolution,
            isVisible: () => true,
            /**
             * @param {number[]} newDomain
             */
            setDomain: (newDomain) => {
                domain = newDomain;
            },
        })
    );
}

async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
}

describe("SingleAxisWindowedSource", () => {
    test("uses a batched loader when one is provided", async () => {
        const source = new TestWindowedSource();
        const load = vi.fn();
        const loadBatch = vi.fn(
            async (
                /** @type {import("../../../genome/genome.js").DiscreteChromosomeInterval[]} */ intervals,
                /** @type {AbortSignal} */ signal
            ) => {
                expect(signal).toBeInstanceOf(AbortSignal);
                return intervals.map((interval) => [interval.chrom]);
            }
        );

        const chunks = await source.discretize([5, 35], {
            load,
            loadBatch,
        });

        expect(load).not.toHaveBeenCalled();
        expect(loadBatch).toHaveBeenCalledOnce();
        expect(loadBatch.mock.calls[0][0]).toEqual([
            { chrom: "chr1", startPos: 5, endPos: 10 },
            { chrom: "chr2", startPos: 0, endPos: 20 },
            { chrom: "chr3", startPos: 0, endPos: 5 },
        ]);
        expect(chunks).toEqual([["chr1"], ["chr2"], ["chr3"]]);
    });

    test("rejects batched results that do not align with intervals", async () => {
        const source = new TestWindowedSource();

        await expect(
            source.discretize([5, 35], {
                load: vi.fn(),
                // Non-obvious: batched loaders must preserve one chunk per interval.
                loadBatch: async () => [["chr1"]],
            })
        ).rejects.toThrow(
            "Batched lazy loader must return one chunk per interval."
        );
    });

    test("falls back to separate loads when batching is not provided", async () => {
        const source = new TestWindowedSource();
        const load = vi.fn(
            async (
                /** @type {import("../../../genome/genome.js").DiscreteChromosomeInterval} */ interval
            ) => [interval.chrom]
        );

        const chunks = await source.discretize([5, 35], { load });

        expect(load).toHaveBeenCalledTimes(3);
        expect(load.mock.calls.map(([interval]) => interval)).toEqual([
            { chrom: "chr1", startPos: 5, endPos: 10 },
            { chrom: "chr2", startPos: 0, endPos: 20 },
            { chrom: "chr3", startPos: 0, endPos: 5 },
        ]);
        expect(chunks).toEqual([["chr1"], ["chr2"], ["chr3"]]);
    });

    test("reloads the current window when asked to repropagate", async () => {
        const view = createViewStub();
        const source = new RepropagatingWindowedSource(view);
        const collector = new Collector();
        source.addChild(collector);

        view.setDomain([2, 8]);
        source.onDomainChanged([2, 8]);
        await flushPromises();

        expect(source.loadedIntervals).toEqual([[0, 20]]);
        expect([...collector.getData()]).toEqual([{ interval: "0-20" }]);

        // Param-dependent downstream transforms may repropagate from a lazy
        // source when no upstream collector can replay stored data.
        source.repropagate();
        await flushPromises();

        expect(source.loadedIntervals).toEqual([
            [0, 20],
            [0, 20],
        ]);
        expect([...collector.getData()]).toEqual([{ interval: "0-20" }]);

        view.setDomain([22, 28]);
        source.repropagate();
        await flushPromises();

        expect(source.loadedIntervals).toEqual([
            [0, 20],
            [0, 20],
            [20, 40],
        ]);
        expect([...collector.getData()]).toEqual([{ interval: "20-40" }]);
    });

    test("reloads unavailable current-domain data", async () => {
        const view = createViewStub();
        const source = new RepropagatingWindowedSource(view);

        view.setDomain([2, 8]);
        source.onDomainChanged([2, 8]);
        await flushPromises();

        expect(source.loadedIntervals).toEqual([[0, 20]]);

        source.markUnavailable();
        source.ensureDataForDomain([2, 8]);
        await flushPromises();

        expect(source.loadedIntervals).toEqual([
            [0, 20],
            [0, 20],
        ]);
    });
});
