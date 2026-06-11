import { beforeEach, describe, expect, it, vi } from "vitest";
import Collector from "../../collector.js";
import ViewParamRuntime from "../../../paramRuntime/viewParamRuntime.js";
import BigWigSource from "./bigWigSource.js";

const featuresByUrl = new Map();

vi.mock("generic-filehandle2", () => ({
    RemoteFile: class RemoteFile {
        constructor(url) {
            this.url = url;
        }
    },
}));

vi.mock("@gmod/bbi", () => ({
    BigWig: class BigWig {
        constructor(options) {
            this.url = options.filehandle.url;
        }

        async getHeader() {
            return {
                zoomLevels: [{ reductionLevel: 10 }],
            };
        }

        async getFeaturesMulti(intervals) {
            return intervals.map(() => featuresByUrl.get(this.url) ?? []);
        }
    },
}));

function createViewStub() {
    const paramRuntime = new ViewParamRuntime(
        () => undefined,
        () => scaleResolution
    );
    const setVisibleSamples = paramRuntime.allocateSetter("visibleSamples", [
        "A",
        "B",
    ]);

    const genome = {
        totalSize: 1000,
        continuousToDiscreteChromosomeIntervals: (interval) => [
            {
                chrom: "chr1",
                startPos: interval[0],
                endPos: interval[1],
            },
        ],
    };

    const scale = () => undefined;
    scale.type = "locus";
    scale.genome = () => genome;

    const scaleResolution = {
        addEventListener: () => undefined,
        getAxisLength: () => 100,
        getDomain: () => [0, 100],
        getScale: () => scale,
    };

    return {
        paramRuntime,
        setVisibleSamples,
        view: {
            paramRuntime,
            getBaseUrl: () => "",
            getScaleResolution: () => scaleResolution,
            isVisible: () => true,
            context: {
                addBroadcastListener: () => undefined,
                dataFlow: {
                    loadingStatusRegistry: {
                        set: () => undefined,
                    },
                },
            },
        },
    };
}

describe("BigWigSource", () => {
    beforeEach(() => {
        featuresByUrl.clear();
        featuresByUrl.set("signals/A.bw", [{ start: 1, end: 2, score: 3 }]);
        featuresByUrl.set("signals/B.bw", [{ start: 4, end: 5, score: 6 }]);
    });

    it("loads multiple descriptors and tags rows with descriptor fields", async () => {
        const { view } = createViewStub();
        const source = new BigWigSource(
            {
                type: "bigwig",
                debounceMode: "domain",
                url: {
                    template: "signals/{sample}.bw",
                    values: { expr: "visibleSamples" },
                    field: "sample",
                },
            },
            /** @type {any} */ (view)
        );
        const collector = new Collector();
        source.addChild(collector);

        await source.initializedPromise;
        expect(source.isDataReadyForDomain({ x: [0, 100] })).toBe(false);

        await source.loadInterval([0, 100], [1, 1]);

        expect([...collector.getData()]).toEqual([
            { sample: "A", chrom: "chr1", start: 1, end: 2, score: 3 },
            { sample: "B", chrom: "chr1", start: 4, end: 5, score: 6 },
        ]);
        expect(source.isDataReadyForDomain({ x: [0, 100] })).toBe(true);
    });
});
