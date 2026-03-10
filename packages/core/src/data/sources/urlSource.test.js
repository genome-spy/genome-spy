import { afterEach, expect, test, vi } from "vitest";
import { formats as vegaFormats } from "vega-loader";
import Collector from "../collector.js";
import { makeParamRuntimeProvider } from "../flowTestUtils.js";
import bed from "../formats/bed.js";
import bedpe from "../formats/bedpe.js";
import UrlSource from "./urlSource.js";

vegaFormats("bed", bed);
vegaFormats("bedpe", bedpe);

/** @type {typeof global.fetch | undefined} */
let originalFetch = global.fetch;

afterEach(() => {
    if (originalFetch) {
        global.fetch = originalFetch;
    }
});

/**
 * @param {UrlSource} source
 */
async function collectSource(source) {
    const collector = new Collector();
    source.addChild(collector);

    await source.load();

    return [...collector.getData()];
}

test("UrlSource reads BED using format.type bed", async () => {
    const text = "chr1\t0\t10\tfeature";

    global.fetch = /** @type {any} */ (
        vi.fn(async () => new Response(text, { status: 200 }))
    );

    /** @type {import("../../view/view.js").default} */
    const viewStub = /** @type {any} */ (
        Object.assign(makeParamRuntimeProvider(), {
            getBaseUrl: () => "",
            context: {
                dataFlow: {
                    loadingStatusRegistry: {
                        /** @returns {void} */
                        set: () => {},
                    },
                },
            },
        })
    );

    const source = new UrlSource(
        {
            url: "example.bed",
            format: { type: "bed" },
        },
        viewStub
    );

    expect(await collectSource(source)).toEqual([
        {
            chrom: "chr1",
            chromStart: 0,
            chromEnd: 10,
            start: 0,
            end: 10,
            name: "feature",
            strand: 0,
        },
    ]);
});

test("UrlSource reads BEDPE using format.type bedpe", async () => {
    const text = "chr1\t10\t20\tchr2\t30\t40\teventA\t5\t+\t-";

    global.fetch = /** @type {any} */ (
        vi.fn(async () => new Response(text, { status: 200 }))
    );

    /** @type {import("../../view/view.js").default} */
    const viewStub = /** @type {any} */ (
        Object.assign(makeParamRuntimeProvider(), {
            getBaseUrl: () => "",
            context: {
                dataFlow: {
                    loadingStatusRegistry: {
                        /** @returns {void} */
                        set: () => {},
                    },
                },
            },
        })
    );

    const source = new UrlSource(
        {
            url: "example.bedpe",
            format: { type: "bedpe" },
        },
        viewStub
    );

    expect(await collectSource(source)).toEqual([
        {
            chrom1: "chr1",
            start1: 10,
            end1: 20,
            chrom2: "chr2",
            start2: 30,
            end2: 40,
            name: "eventA",
            score: 5,
            strand1: "+",
            strand2: "-",
        },
    ]);
});
