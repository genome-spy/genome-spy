import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Collector from "../../collector.js";
import ViewParamRuntime from "../../../paramRuntime/viewParamRuntime.js";
import BigWigSource from "./bigWigSource.js";

/** @type {Map<string, { start: number, end: number, score: number }[]>} */
const featuresByUrl = new Map();
/** @type {{ refName: string, start: number, end: number }[]} */
const requestedIntervals = [];
/** @type {string[]} */
const openedUrls = [];
/** @type {Set<string>} */
const failingHeaderUrls = new Set();

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
            openedUrls.push(this.url);
        }

        async getHeader() {
            if (failingHeaderUrls.has(this.url)) {
                throw new Error("Missing BigWig");
            }
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

/**
 * @param {string[]} initialVisibleSamples
 */
function createViewStub(initialVisibleSamples = ["A", "B"]) {
    let domain = [0, 100];
    /** @type {{ status: import("../../../types/viewContext.js").DataLoadingStatus, detail?: string }[]} */
    const loadingStatuses = [];

    /** @type {any} */
    let scaleResolution;
    const paramRuntime = new ViewParamRuntime(
        () => undefined,
        () => scaleResolution
    );
    const setVisibleSamples = paramRuntime.allocateSetter(
        "visibleSamples",
        initialVisibleSamples
    );

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
        loadingStatuses,
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
                        set: (
                            /** @type {any} */ _view,
                            /** @type {import("../../../types/viewContext.js").DataLoadingStatus} */ status,
                            /** @type {string | undefined} */ detail
                        ) => loadingStatuses.push({ status, detail }),
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
        openedUrls.length = 0;
        failingHeaderUrls.clear();
        featuresByUrl.set("signals/A.bw", [{ start: 1, end: 2, score: 3 }]);
        featuresByUrl.set("signals/B.bw", [{ start: 4, end: 5, score: 6 }]);
        featuresByUrl.set("signals/C.bw", [{ start: 7, end: 8, score: 9 }]);
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

        const { view, setDomain, setVisibleSamples } = createViewStub([]);
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

    it("reloads when restored URL values are cached but not loaded for the current domain", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("window", {
            setTimeout,
            clearTimeout,
        });

        const { view, setVisibleSamples } = createViewStub();
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
        await source.loadInterval([0, 100], [1, 1]);

        expect(openedUrls).toEqual(["signals/A.bw", "signals/B.bw"]);
        expect(requestedIntervals).toHaveLength(2);

        setVisibleSamples(["B", "A"]);
        await /** @type {any} */ (source).initializedPromise;
        await vi.runAllTimersAsync();

        expect(openedUrls).toEqual(["signals/A.bw", "signals/B.bw"]);
        expect(requestedIntervals).toHaveLength(2);
        expect(source.isDataReadyForDomain({ x: [0, 100] })).toBe(true);

        setVisibleSamples(["A"]);
        await /** @type {any} */ (source).initializedPromise;
        await vi.runAllTimersAsync();

        expect(openedUrls).toEqual(["signals/A.bw", "signals/B.bw"]);
        expect(requestedIntervals).toHaveLength(2);
        expect(source.isDataReadyForDomain({ x: [0, 100] })).toBe(true);

        const domainChangePromise = source.onDomainChanged([100, 200]);
        await vi.runAllTimersAsync();
        await domainChangePromise;

        expect(requestedIntervals).toHaveLength(3);
        expect([...collector.getData()]).toEqual([
            { sample: "A", chrom: "chr1", start: 1, end: 2, score: 3 },
        ]);

        setVisibleSamples(["A", "B"]);
        await /** @type {any} */ (source).initializedPromise;
        await vi.runAllTimersAsync();

        expect(openedUrls).toEqual(["signals/A.bw", "signals/B.bw"]);
        expect(requestedIntervals).toHaveLength(5);
        expect([...collector.getData()]).toEqual([
            { sample: "A", chrom: "chr1", start: 1, end: 2, score: 3 },
            { sample: "B", chrom: "chr1", start: 4, end: 5, score: 6 },
        ]);

        setVisibleSamples(["A", "C"]);
        await /** @type {any} */ (source).initializedPromise;
        await vi.runAllTimersAsync();

        expect(openedUrls).toEqual([
            "signals/A.bw",
            "signals/B.bw",
            "signals/C.bw",
        ]);
        expect(requestedIntervals).toHaveLength(7);
        expect([...collector.getData()]).toEqual([
            { sample: "A", chrom: "chr1", start: 1, end: 2, score: 3 },
            { sample: "C", chrom: "chr1", start: 7, end: 8, score: 9 },
        ]);
    });

    it("treats maxValues overflow updates as an empty completed lazy source", async () => {
        const { view, setVisibleSamples, loadingStatuses } = createViewStub([
            "A",
        ]);
        const source = new BigWigSource(
            {
                type: "bigwig",
                debounceMode: "domain",
                url: {
                    template: "signals/{sample}.bw",
                    values: { expr: "visibleSamples" },
                    field: "sample",
                    maxValues: 1,
                },
            },
            /** @type {any} */ (view)
        );
        const collector = new Collector();
        source.addChild(collector);

        await /** @type {any} */ (source).initializedPromise;
        await source.loadInterval([0, 100], [1, 1]);

        expect(openedUrls).toEqual(["signals/A.bw"]);
        expect([...collector.getData()]).toEqual([
            { sample: "A", chrom: "chr1", start: 1, end: 2, score: 3 },
        ]);

        setVisibleSamples(["A", "B"]);
        await /** @type {any} */ (source).initializedPromise;

        expect(openedUrls).toEqual(["signals/A.bw"]);
        expect(loadingStatuses.at(-1)).toEqual({ status: "complete" });
        expect([...collector.getData()]).toEqual([]);
    });

    it("skips failed template URLs when configured", async () => {
        const warn = vi
            .spyOn(console, "warn")
            .mockImplementation(() => undefined);
        failingHeaderUrls.add("signals/missing.bw");

        const { view, loadingStatuses } = createViewStub(["A", "missing"]);
        const source = new BigWigSource(
            {
                type: "bigwig",
                debounceMode: "domain",
                url: {
                    template: "signals/{sample}.bw",
                    values: { expr: "visibleSamples" },
                    field: "sample",
                    onLoadError: "skip",
                },
            },
            /** @type {any} */ (view)
        );
        const collector = new Collector();
        source.addChild(collector);

        await /** @type {any} */ (source).initializedPromise;
        await source.loadInterval([0, 100], [1]);

        expect(openedUrls).toEqual(["signals/A.bw", "signals/missing.bw"]);
        expect(loadingStatuses.at(-1)).toEqual({ status: "complete" });
        expect([...collector.getData()]).toEqual([
            { sample: "A", chrom: "chr1", start: 1, end: 2, score: 3 },
        ]);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining("Skipping failed URL: signals/missing.bw"),
            expect.any(Error)
        );
    });
});
