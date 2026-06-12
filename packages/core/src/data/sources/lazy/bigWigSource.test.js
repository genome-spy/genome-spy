import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Collector from "../../collector.js";
import ViewParamRuntime from "../../../paramRuntime/viewParamRuntime.js";
import BigWigSource from "./bigWigSource.js";

/** @type {Map<string, { start: number, end: number, score: number }[]>} */
const featuresByUrl = new Map();
/** @type {{ refName: string, start: number, end: number }[]} */
const requestedIntervals = [];

vi.mock("generic-filehandle2", () => ({
    RemoteFile: class RemoteFile {
        /** @param {string} url */
        constructor(url) {
            this.url = url;
        }
    },
}));

vi.mock("@gmod/bbi", () => ({
    BigWig: class BigWig {
        /** @param {{ filehandle: { url: string } }} options */
        constructor(options) {
            this.url = options.filehandle.url;
        }

        async getHeader() {
            return {
                zoomLevels: [{ reductionLevel: 10 }],
            };
        }

        /** @param {{ refName: string, start: number, end: number }[]} intervals */
        async getFeaturesMulti(intervals) {
            requestedIntervals.push(...intervals);
            return intervals.map((interval) =>
                interval.end > interval.start
                    ? (featuresByUrl.get(this.url) ?? [])
                    : []
            );
        }
    },
}));

function createViewStub() {
    let domain = [0, 100];

    /** @type {any} */
    let scaleResolution;
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
        continuousToDiscreteChromosomeIntervals: (
            /** @type {number[]} */ interval
        ) => [
            {
                chrom: "chr1",
                startPos: interval[0],
                endPos: interval[1],
            },
        ],
    };

    const scale = /** @type {any} */ (
        /** @returns {undefined} */ () => undefined
    );
    scale.type = "locus";
    scale.genome = () => genome;

    scaleResolution = {
        addEventListener: /** @returns {undefined} */ () => undefined,
        getAxisLength: () => 100,
        getDomain: () => domain,
        getScale: () => scale,
    };

    return {
        paramRuntime,
        setVisibleSamples,
        setDomain: (/** @type {number[]} */ value) => {
            domain = value;
        },
        view: {
            paramRuntime,
            getBaseUrl: () => "",
            getScaleResolution: () => scaleResolution,
            isVisible: () => true,
            context: {
                addBroadcastListener: /** @returns {undefined} */ () =>
                    undefined,
                dataFlow: {
                    loadingStatusRegistry: {
                        set: /** @returns {undefined} */ () => undefined,
                    },
                },
            },
        },
    };
}

describe("BigWigSource", () => {
    beforeEach(() => {
        featuresByUrl.clear();
        requestedIntervals.length = 0;
        featuresByUrl.set("signals/A.bw", [{ start: 1, end: 2, score: 3 }]);
        featuresByUrl.set("signals/B.bw", [{ start: 4, end: 5, score: 6 }]);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
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

        await /** @type {any} */ (source).initializedPromise;
        expect(source.isDataReadyForDomain({ x: [0, 100] })).toBe(false);

        await source.loadInterval([0, 100], [1, 1]);

        expect([...collector.getData()]).toEqual([
            { sample: "A", chrom: "chr1", start: 1, end: 2, score: 3 },
            { sample: "B", chrom: "chr1", start: 4, end: 5, score: 6 },
        ]);
        expect(source.isDataReadyForDomain({ x: [0, 100] })).toBe(true);
    });

    it("reloads the current scale domain when URL values change before the first domain event", async () => {
        // URL expression updates can arrive before layout/domain events have populated the cached domain.
        vi.useFakeTimers();
        vi.stubGlobal("window", {
            setTimeout,
            clearTimeout,
        });

        const { view, setDomain, setVisibleSamples } = createViewStub();
        setDomain([100, 200]);
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

        await /** @type {any} */ (source).initializedPromise;

        setVisibleSamples(["A"]);
        await /** @type {any} */ (source).initializedPromise;
        await vi.runAllTimersAsync();

        expect(requestedIntervals.at(-1)).toEqual({
            refName: "chr1",
            start: 0,
            end: 1000,
        });
        expect([...collector.getData()]).toEqual([
            { sample: "A", chrom: "chr1", start: 1, end: 2, score: 3 },
        ]);
    });
});
