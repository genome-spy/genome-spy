import { beforeEach, describe, expect, it, vi } from "vitest";
import Collector from "../../collector.js";
import ViewParamRuntime from "../../../paramRuntime/viewParamRuntime.js";
import TabixTsvSource from "./tabixTsvSource.js";

/** @type {Map<string, string[]>} */
const linesByUrl = new Map();
/** @type {Map<string, string>} */
const indexUrlByUrl = new Map();
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
            indexUrlByUrl.set(this.url, this.indexUrl);
        }

        async getHeader() {
            if (failingHeaderUrls.has(this.url)) {
                throw new Error("Missing Tabix file");
            }
            return "#chrom\tstart\tend\tvalue";
        }

        /**
         * @param {string} chrom
         * @param {number} startPos
         * @param {number} endPos
         * @param {{ lineCallback: (line: string) => void }} options
         */
        async getLines(chrom, startPos, endPos, options) {
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
    paramRuntime.allocateSetter("visibleCancers", ["ovarian", "breast"]);

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
        failingHeaderUrls.clear();
        linesByUrl.set("variants/ovarian.vcf.gz", ["chr1\t1\t2\tA"]);
        linesByUrl.set("variants/breast.vcf.gz", ["chr1\t3\t4\tB"]);
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
});
