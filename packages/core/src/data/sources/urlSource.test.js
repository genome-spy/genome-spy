import { afterEach, expect, test, vi } from "vitest";
import { formats as vegaFormats } from "vega-loader";
import Collector from "../collector.js";
import { makeParamRuntimeProvider } from "../flowTestUtils.js";
import bed from "../formats/bed.js";
import UrlSource from "./urlSource.js";

vegaFormats("bed", bed);

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
