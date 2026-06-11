import { beforeEach, describe, expect, it, vi } from "vitest";
import Collector from "../../collector.js";
import ViewParamRuntime from "../../../paramRuntime/viewParamRuntime.js";
import TabixTsvSource from "./tabixTsvSource.js";

const linesByUrl = new Map();
const indexUrlByUrl = new Map();

vi.mock("generic-filehandle2", () => ({
    RemoteFile: class RemoteFile {
        constructor(url) {
            this.url = url;
        }
    },
}));

vi.mock("@gmod/tabix", () => ({
    TabixIndexedFile: class TabixIndexedFile {
        constructor(options) {
            this.url = options.filehandle.url;
            this.indexUrl = options.tbiFilehandle.url;
            indexUrlByUrl.set(this.url, this.indexUrl);
        }

        async getHeader() {
            return "#chrom\tstart\tend\tvalue";
        }

        async getLines(chrom, startPos, endPos, options) {
            for (const line of linesByUrl.get(this.url) ?? []) {
                options.lineCallback(line);
            }
        }
    },
}));

function createViewStub() {
    const paramRuntime = new ViewParamRuntime(
        () => undefined,
        () => scaleResolution
    );
    paramRuntime.allocateSetter("visibleCancers", ["ovarian", "breast"]);

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
    };
}

describe("TabixSource", () => {
    beforeEach(() => {
        linesByUrl.clear();
        indexUrlByUrl.clear();
        linesByUrl.set("variants/ovarian.vcf.gz", ["chr1\t1\t2\tA"]);
        linesByUrl.set("variants/breast.vcf.gz", ["chr1\t3\t4\tB"]);
    });

    it("loads multiple URL/index descriptors and tags parsed rows", async () => {
        const source = new TabixTsvSource(
            {
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
            },
            /** @type {any} */ (createViewStub())
        );
        const collector = new Collector();
        source.addChild(collector);

        await source.initializedPromise;
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
});
