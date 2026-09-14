import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Collector from "../../collector.js";
import ViewParamRuntime from "../../../paramRuntime/viewParamRuntime.js";
import BigBedSource from "./bigBedSource.js";

/** @type {string[]} */
const openedUrls = [];
/** @type {Map<string, { start: number, end: number, rest: string }[]>} */
const featuresByUrl = new Map();
/** @type {{ chrom: string, start: number, end: number }[]} */
const requestedIntervals = [];
/** @type {Set<string>} */
const failingHeaderUrls = new Set();
/** @type {Map<number, Promise<{ start: number, end: number, rest: string }[]>>} */
const pendingFeatures = new Map();

vi.mock("generic-filehandle2", () => ({
    RemoteFile: class RemoteFile {
        /** @param {string} url */
        constructor(url) {
            this.url = url;
            openedUrls.push(url);
        }
    },
}));

vi.mock("@gmod/bed", () => ({
    default: class Bed {
        /** @param {string} line */
        parseLine(line) {
            const [chrom, start, end, name] = line.split("\t");
            return {
                chrom,
                chromStart: Number(start),
                chromEnd: Number(end),
                name,
            };
        }
    },
}));

vi.mock("@gmod/bbi", () => ({
    BigBed: class BigBed {
        /** @param {{ filehandle: { url: string } }} options */
        constructor(options) {
            this.url = options.filehandle.url;
        }

        async getHeader() {
            if (failingHeaderUrls.has(this.url)) {
                throw new Error("Missing BigBed");
            }
            return /** @type {{ autoSql: any }} */ ({ autoSql: undefined });
        }

        /**
         * @param {string} chrom
         * @param {number} start
         * @param {number} end
         */
        async getFeatures(chrom, start, end) {
            requestedIntervals.push({ chrom, start, end });
            return (
                pendingFeatures.get(start) ?? featuresByUrl.get(this.url) ?? []
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

    const scale = /** @type {any} */ (
        /** @returns {undefined} */ () => undefined
    );
    scale.type = "locus";
    scale.genome = () => ({
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
    });

    scaleResolution = {
        addEventListener: /** @returns {undefined} */ () => undefined,
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
        getBaseUrl: () => "https://example.org/spec/",
        getScaleResolution: () => scaleResolution,
        isVisible: () => true,
        context: {
            addBroadcastListener: /** @returns {undefined} */ () => undefined,
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
    };
}

describe("BigBedSource", () => {
    beforeEach(() => {
        openedUrls.length = 0;
        requestedIntervals.length = 0;
        failingHeaderUrls.clear();
        pendingFeatures.clear();
        featuresByUrl.clear();
        featuresByUrl.set("https://example.org/spec/features/A.bb", [
            { start: 1, end: 2, rest: "feature A" },
        ]);
        featuresByUrl.set("https://example.org/spec/features/B.bb", [
            { start: 3, end: 4, rest: "feature B" },
        ]);
        featuresByUrl.set("https://example.org/spec/features/C.bb", [
            { start: 5, end: 6, rest: "feature C" },
        ]);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("opens a single normalized URL only when requested", async () => {
        const source = new BigBedSource(
            {
                type: "bigbed",
                url: "features.bb",
            },
            /** @type {any} */ (createViewStub())
        );

        expect(openedUrls).toEqual([]);
        await source.requestInterval([0, 100]);

        expect(openedUrls).toEqual(["https://example.org/spec/features.bb"]);
    });

    it("loads multiple descriptors and tags parsed rows", async () => {
        const source = new BigBedSource(
            {
                type: "bigbed",
                debounceMode: "domain",
                url: {
                    template: "features/{sample}.bb",
                    values: ["A", "B"],
                    field: "sample",
                },
            },
            /** @type {any} */ (createViewStub())
        );
        const collector = new Collector();
        source.addChild(collector);
        /**
         * Collector observers must see descriptor readiness at completion time.
         * @type {boolean[]}
         */
        const readinessAtCompletion = [];
        collector.observe(() =>
            readinessAtCompletion.push(
                source.isDataReadyForDomain({ x: [0, 100] })
            )
        );

        await source.requestInterval([0, 100]);

        expect(openedUrls).toEqual([
            "https://example.org/spec/features/A.bb",
            "https://example.org/spec/features/B.bb",
        ]);
        expect([...collector.getData()]).toEqual([
            {
                sample: "A",
                chrom: "chr1",
                chromStart: 1,
                chromEnd: 2,
                name: "feature A",
            },
            {
                sample: "B",
                chrom: "chr1",
                chromStart: 3,
                chromEnd: 4,
                name: "feature B",
            },
        ]);
        expect(readinessAtCompletion).toEqual([true]);
    });

    it("skips failed template URLs when configured", async () => {
        const warn = vi
            .spyOn(console, "warn")
            .mockImplementation(() => undefined);
        failingHeaderUrls.add("https://example.org/spec/features/missing.bb");

        const source = new BigBedSource(
            {
                type: "bigbed",
                debounceMode: "domain",
                url: {
                    template: "features/{sample}.bb",
                    values: ["A", "missing"],
                    field: "sample",
                    onLoadError: "skip",
                },
            },
            /** @type {any} */ (createViewStub())
        );
        const collector = new Collector();
        source.addChild(collector);

        await source.requestInterval([0, 100]);

        expect(openedUrls).toEqual([
            "https://example.org/spec/features/A.bb",
            "https://example.org/spec/features/missing.bb",
        ]);
        expect([...collector.getData()]).toEqual([
            {
                sample: "A",
                chrom: "chr1",
                chromStart: 1,
                chromEnd: 2,
                name: "feature A",
            },
        ]);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining(
                "Skipping failed URL: https://example.org/spec/features/missing.bb"
            ),
            expect.any(Error)
        );

        failingHeaderUrls.clear();
        await source.requestInterval([100, 200]);
        expect(
            openedUrls.filter((url) => url.endsWith("missing.bb"))
        ).toHaveLength(2);
    });

    it("does not publish a superseded interval", async () => {
        /** @type {(features: { start: number, end: number, rest: string }[]) => void} */
        let resolveFirst = () => undefined;
        pendingFeatures.set(
            0,
            new Promise((resolve) => {
                resolveFirst = resolve;
            })
        );
        const view = createViewStub(["A"]);
        const source = new BigBedSource(
            { type: "bigbed", debounceMode: "domain", url: "features/A.bb" },
            /** @type {any} */ (view)
        );
        const collector = new Collector();
        source.addChild(collector);

        const first = source.requestInterval([0, 10]);
        await vi.waitFor(() => expect(requestedIntervals).toHaveLength(1));
        await source.requestInterval([20, 30]);
        resolveFirst([{ start: 7, end: 8, rest: "stale" }]);
        await first;

        expect([...collector.getData()]).toEqual([
            {
                chrom: "chr1",
                chromStart: 1,
                chromEnd: 2,
                name: "feature A",
            },
        ]);
        expect(source.getLoadedDomain()).toEqual([20, 30]);
        expect(view.loadingStatuses.at(-1)).toEqual({
            status: "complete",
            detail: undefined,
        });
    });

    it("reloads when restored URL values are cached but not loaded for the current domain", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("window", {
            setTimeout,
            clearTimeout,
        });

        const view = createViewStub();
        const source = new BigBedSource(
            {
                type: "bigbed",
                debounceMode: "domain",
                url: {
                    template: "features/{sample}.bb",
                    values: { expr: "visibleSamples" },
                    field: "sample",
                },
            },
            /** @type {any} */ (view)
        );
        const collector = new Collector();
        source.addChild(collector);

        await source.requestInterval([0, 100]);

        expect(openedUrls).toEqual([
            "https://example.org/spec/features/A.bb",
            "https://example.org/spec/features/B.bb",
        ]);
        expect(requestedIntervals).toHaveLength(2);

        view.setVisibleSamples(["B", "A"]);
        await vi.runAllTimersAsync();

        expect(openedUrls).toEqual([
            "https://example.org/spec/features/A.bb",
            "https://example.org/spec/features/B.bb",
        ]);
        expect(requestedIntervals).toHaveLength(4);
        expect(source.isDataReadyForDomain({ x: [0, 100] })).toBe(true);

        view.setVisibleSamples(["A"]);
        await vi.runAllTimersAsync();

        expect(requestedIntervals).toHaveLength(5);
        expect(source.isDataReadyForDomain({ x: [0, 100] })).toBe(true);

        const domainChangePromise = source.onDomainChanged([100, 200]);
        await vi.runAllTimersAsync();
        await domainChangePromise;

        expect(requestedIntervals).toHaveLength(5);
        expect([...collector.getData()]).toEqual([
            {
                sample: "A",
                chrom: "chr1",
                chromStart: 1,
                chromEnd: 2,
                name: "feature A",
            },
        ]);

        view.setVisibleSamples(["A", "B"]);
        await vi.runAllTimersAsync();

        expect(openedUrls).toEqual([
            "https://example.org/spec/features/A.bb",
            "https://example.org/spec/features/B.bb",
        ]);
        expect(requestedIntervals).toHaveLength(7);
        expect([...collector.getData()]).toEqual([
            {
                sample: "A",
                chrom: "chr1",
                chromStart: 1,
                chromEnd: 2,
                name: "feature A",
            },
            {
                sample: "B",
                chrom: "chr1",
                chromStart: 3,
                chromEnd: 4,
                name: "feature B",
            },
        ]);

        view.setVisibleSamples(["A", "C"]);
        await vi.runAllTimersAsync();

        expect(openedUrls).toEqual([
            "https://example.org/spec/features/A.bb",
            "https://example.org/spec/features/B.bb",
            "https://example.org/spec/features/C.bb",
        ]);
        expect(requestedIntervals).toHaveLength(9);
        expect([...collector.getData()]).toEqual([
            {
                sample: "A",
                chrom: "chr1",
                chromStart: 1,
                chromEnd: 2,
                name: "feature A",
            },
            {
                sample: "C",
                chrom: "chr1",
                chromStart: 5,
                chromEnd: 6,
                name: "feature C",
            },
        ]);
    });

    it("treats maxValues overflow as an empty completed lazy source", async () => {
        const view = createViewStub(["A", "B"]);
        const source = new BigBedSource(
            {
                type: "bigbed",
                debounceMode: "domain",
                url: {
                    template: "features/{sample}.bb",
                    values: { expr: "visibleSamples" },
                    field: "sample",
                    maxValues: 1,
                },
            },
            /** @type {any} */ (view)
        );
        const collector = new Collector();
        source.addChild(collector);

        await source.requestInterval([0, 100]);

        expect(openedUrls).toEqual([]);
        expect(view.loadingStatuses.at(-1)).toEqual({ status: "complete" });
        expect([...collector.getData()]).toEqual([]);
    });
});
