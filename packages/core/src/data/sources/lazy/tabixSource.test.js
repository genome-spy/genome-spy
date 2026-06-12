import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Collector from "../../collector.js";
import ViewParamRuntime from "../../../paramRuntime/viewParamRuntime.js";
import RegexFoldTransform from "../../transforms/regexFold.js";
import TabixTsvSource from "./tabixTsvSource.js";

/** @type {Map<string, string[]>} */
const linesByUrl = new Map();
/** @type {Map<string, string>} */
const indexUrlByUrl = new Map();
/** @type {string[]} */
const openedUrls = [];
/** @type {{ chrom: string, start: number, end: number }[]} */
const requestedIntervals = [];
/** @type {Map<string, string>} */
const headerByUrl = new Map();
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

vi.mock("@gmod/tabix", () => ({
    TabixIndexedFile: class TabixIndexedFile {
        /** @param {{ filehandle: { url: string }, tbiFilehandle: { url: string } }} options */
        constructor(options) {
            this.url = options.filehandle.url;
            this.indexUrl = options.tbiFilehandle.url;
            openedUrls.push(this.url);
            indexUrlByUrl.set(this.url, this.indexUrl);
        }

        async getHeader() {
            if (failingHeaderUrls.has(this.url)) {
                throw new Error("Missing Tabix file");
            }
            return headerByUrl.get(this.url) ?? "#chrom\tstart\tend\tvalue";
        }

        /**
         * @param {string} chrom
         * @param {number} startPos
         * @param {number} endPos
         * @param {{ lineCallback: (line: string) => void }} options
         */
        async getLines(chrom, startPos, endPos, options) {
            requestedIntervals.push({ chrom, start: startPos, end: endPos });
            for (const line of linesByUrl.get(this.url) ?? []) {
                options.lineCallback(line);
            }
        }
    },
}));

function createViewStub() {
    /** @type {any} */
    let scaleResolution;
    const paramRuntime = new ViewParamRuntime(
        () => undefined,
        () => scaleResolution
    );
    const setVisibleCancers = paramRuntime.allocateSetter("visibleCancers", [
        "ovarian",
        "breast",
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
        getDomain: () => [0, 100],
        getScale: () => scale,
    };

    return {
        paramRuntime,
        setVisibleCancers,
        getBaseUrl: () => "",
        getScaleResolution: () => scaleResolution,
        isVisible: () => true,
        context: {
            addBroadcastListener: /** @returns {undefined} */ () => undefined,
            dataFlow: {
                loadingStatusRegistry: {
                    set: /** @returns {undefined} */ () => undefined,
                },
            },
        },
    };
}

describe("TabixSource", () => {
    beforeEach(() => {
        linesByUrl.clear();
        indexUrlByUrl.clear();
        openedUrls.length = 0;
        requestedIntervals.length = 0;
        headerByUrl.clear();
        failingHeaderUrls.clear();
        linesByUrl.set("variants/ovarian.vcf.gz", ["chr1\t1\t2\tA"]);
        linesByUrl.set("variants/breast.vcf.gz", ["chr1\t3\t4\tB"]);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("loads multiple URL/index descriptors and tags parsed rows", async () => {
        const source = new TabixTsvSource(
            /** @type {any} */ ({
                type: "tabix",
                debounceMode: "domain",
                url: {
                    template: "variants/{cancer}.vcf.gz",
                    values: { expr: "visibleCancers" },
                    field: "cancer",
                },
                indexUrl: {
                    template: "variants/{cancer}.vcf.gz.tbi",
                },
            }),
            /** @type {any} */ (createViewStub())
        );
        const collector = new Collector();
        source.addChild(collector);

        await /** @type {any} */ (source).initializedPromise;
        await source.loadInterval([0, 100]);

        expect(indexUrlByUrl).toEqual(
            new Map([
                ["variants/ovarian.vcf.gz", "variants/ovarian.vcf.gz.tbi"],
                ["variants/breast.vcf.gz", "variants/breast.vcf.gz.tbi"],
            ])
        );
        expect([...collector.getData()]).toEqual([
            {
                cancer: "ovarian",
                chrom: "chr1",
                start: 1,
                end: 2,
                value: "A",
            },
            {
                cancer: "breast",
                chrom: "chr1",
                start: 3,
                end: 4,
                value: "B",
            },
        ]);
    });

    it("skips failed template URLs when configured", async () => {
        const warn = vi
            .spyOn(console, "warn")
            .mockImplementation(() => undefined);
        failingHeaderUrls.add("variants/missing.vcf.gz");

        const source = new TabixTsvSource(
            /** @type {any} */ ({
                type: "tabix",
                debounceMode: "domain",
                url: {
                    template: "variants/{cancer}.vcf.gz",
                    values: ["ovarian", "missing"],
                    field: "cancer",
                    onLoadError: "skip",
                },
                indexUrl: {
                    template: "variants/{cancer}.vcf.gz.tbi",
                },
            }),
            /** @type {any} */ (createViewStub())
        );
        const collector = new Collector();
        source.addChild(collector);

        await /** @type {any} */ (source).initializedPromise;
        await source.loadInterval([0, 100]);

        expect(indexUrlByUrl).toEqual(
            new Map([
                ["variants/ovarian.vcf.gz", "variants/ovarian.vcf.gz.tbi"],
                ["variants/missing.vcf.gz", "variants/missing.vcf.gz.tbi"],
            ])
        );
        expect([...collector.getData()]).toEqual([
            {
                cancer: "ovarian",
                chrom: "chr1",
                start: 1,
                end: 2,
                value: "A",
            },
        ]);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining(
                "Skipping failed URL: variants/missing.vcf.gz"
            ),
            expect.any(Error)
        );
    });

    it("propagates separate file batches for Tabix partitions with different columns", async () => {
        headerByUrl.set(
            "variants/patient1.tsv.gz",
            "#chrom\tstart\tend\tS1_ref\tS1_alt"
        );
        headerByUrl.set(
            "variants/patient2.tsv.gz",
            "#chrom\tstart\tend\tS2_ref\tS2_alt"
        );
        linesByUrl.set("variants/patient1.tsv.gz", ["chr1\t1\t2\t10\t11"]);
        linesByUrl.set("variants/patient2.tsv.gz", ["chr1\t3\t4\t20\t21"]);

        const source = new TabixTsvSource(
            /** @type {any} */ ({
                type: "tabix",
                debounceMode: "domain",
                url: {
                    template: "variants/{patient}.tsv.gz",
                    values: ["patient1", "patient2"],
                    field: "patient",
                },
            }),
            /** @type {any} */ (createViewStub())
        );
        const fold = new RegexFoldTransform({
            type: "regexFold",
            columnRegex: ["(.+)_ref", "(.+)_alt"],
            asKey: "sample",
            asValue: ["ref", "alt"],
        });
        const collector = new Collector();
        source.addChild(fold);
        fold.addChild(collector);

        await /** @type {any} */ (source).initializedPromise;
        await source.loadInterval([0, 100]);

        expect([...collector.getData()]).toEqual([
            {
                patient: "patient1",
                chrom: "chr1",
                start: 1,
                end: 2,
                sample: "S1",
                ref: 10,
                alt: 11,
            },
            {
                patient: "patient2",
                chrom: "chr1",
                start: 3,
                end: 4,
                sample: "S2",
                ref: 20,
                alt: 21,
            },
        ]);
    });

    it("reuses cached handles when template values are sorted", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("window", {
            setTimeout,
            clearTimeout,
        });

        const view = createViewStub();
        const source = new TabixTsvSource(
            /** @type {any} */ ({
                type: "tabix",
                debounceMode: "domain",
                url: {
                    template: "variants/{cancer}.vcf.gz",
                    values: { expr: "visibleCancers" },
                    field: "cancer",
                },
            }),
            /** @type {any} */ (view)
        );
        const collector = new Collector();
        source.addChild(collector);

        await /** @type {any} */ (source).initializedPromise;
        await source.loadInterval([0, 100]);

        expect(openedUrls).toEqual([
            "variants/ovarian.vcf.gz",
            "variants/breast.vcf.gz",
        ]);
        expect(requestedIntervals).toHaveLength(2);

        view.setVisibleCancers(["breast", "ovarian"]);
        await /** @type {any} */ (source).initializedPromise;
        await vi.runAllTimersAsync();

        expect(openedUrls).toEqual([
            "variants/ovarian.vcf.gz",
            "variants/breast.vcf.gz",
        ]);
        expect(requestedIntervals).toHaveLength(2);
        expect(source.isDataReadyForDomain({ x: [0, 100] })).toBe(true);
    });
});
