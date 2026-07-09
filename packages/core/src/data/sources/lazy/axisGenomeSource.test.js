import { describe, expect, test, vi } from "vitest";
import Genome from "../../../genome/genome.js";
import Collector from "../../collector.js";
import AxisGenomeSource from "./axisGenomeSource.js";

const genome = new Genome({
    name: "test",
    contigs: [
        { name: "chr1", size: 10 },
        { name: "chr2", size: 20 },
    ],
});

function createViewStub() {
    const scaleResolution = {
        getDomain: () => [0, genome.totalSize],
        getScale: () => ({
            genome: () => genome,
        }),
    };

    return /** @type {import("../../../view/view.js").default} */ (
        /** @type {any} */ ({
            context: {
                dataFlow: {
                    loadingStatusRegistry: {
                        set: vi.fn(),
                    },
                },
            },
            getScaleResolution: () => scaleResolution,
        })
    );
}

describe("AxisGenomeSource", () => {
    test("repropagates by loading static genome data", async () => {
        const source = new AxisGenomeSource(
            { type: "axisGenome", channel: "x" },
            createViewStub()
        );
        const collector = new Collector();
        source.addChild(collector);

        expect(source.isDataReadyForDomain({ x: [100, 200] })).toBe(false);

        source.repropagate();
        await Promise.resolve();

        expect(source.isDataReadyForDomain({ x: [100, 200] })).toBe(true);
        expect([...collector.getData()].map((datum) => datum.name)).toEqual([
            "chr1",
            "chr2",
        ]);
    });
});
