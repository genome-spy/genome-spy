import { describe, expect, test, vi } from "vitest";
import Genome from "../../../genome/genome.js";
import SingleAxisWindowedSource from "./singleAxisWindowedSource.js";

const genome = new Genome({
    name: "test",
    contigs: [
        { name: "chr1", size: 10 },
        { name: "chr2", size: 20 },
        { name: "chr3", size: 30 },
    ],
});

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

function createViewStub() {
    const scaleResolution = {
        addEventListener: vi.fn(),
        getDomain: () => [0, genome.totalSize],
        getScale: () => ({
            genome: () => genome,
        }),
    };

    return /** @type {import("../../../view/view.js").default} */ (
        /** @type {any} */ ({
            context: {
                addBroadcastListener: vi.fn(),
                dataFlow: {
                    loadingStatusRegistry: {
                        set: vi.fn(),
                    },
                },
            },
            getScaleResolution: () => scaleResolution,
            isVisible: () => true,
        })
    );
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
});
