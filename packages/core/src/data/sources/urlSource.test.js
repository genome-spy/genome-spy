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
 * Uses the platform gzip stream so the test covers the same byte shape that
 * UrlSource sees in browsers.
 *
 * @param {string} text
 */
async function gzipText(text) {
    const stream = new Blob([text])
        .stream()
        .pipeThrough(new CompressionStream("gzip"));

    return await new Response(stream).arrayBuffer();
}

function createViewStub() {
    /** @type {import("../../view/view.js").default} */
    return /** @type {any} */ (
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
}

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

    const source = new UrlSource(
        {
            url: "example.bed",
            format: { type: "bed" },
        },
        createViewStub()
    );

    expect(await collectSource(source)).toEqual([
        {
            chrom: "chr1",
            chromStart: 0,
            chromEnd: 10,
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

    const source = new UrlSource(
        {
            url: "example.bedpe",
            format: { type: "bedpe" },
        },
        createViewStub()
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
            strand1: 1,
            strand2: -1,
        },
    ]);
});

test("UrlSource reads gzip-compressed TSV content transparently", async () => {
    const compressed = await gzipText("chrom\tstart\nchr1\t10\n");

    global.fetch = /** @type {any} */ (
        vi.fn(
            async () =>
                new Response(compressed, {
                    status: 200,
                    headers: {
                        "Content-Type": "application/gzip",
                    },
                })
        )
    );

    const source = new UrlSource(
        {
            url: "example.tsv.gz",
        },
        createViewStub()
    );

    expect(await collectSource(source)).toEqual([
        {
            chrom: "chr1",
            start: 10,
        },
    ]);
});

test("UrlSource accepts already-decoded content behind a .gz URL", async () => {
    global.fetch = /** @type {any} */ (
        vi.fn(
            async () =>
                new Response("chrom\tstart\nchr1\t10\n", {
                    status: 200,
                })
        )
    );

    const source = new UrlSource(
        {
            url: "example.tsv.gz",
        },
        createViewStub()
    );

    expect(await collectSource(source)).toEqual([
        {
            chrom: "chr1",
            start: 10,
        },
    ]);
});

test("UrlSource reads bgzip-compressed TSV content transparently", async () => {
    const compressed = await gzipText("chrom\tstart\nchr2\t20\n");

    global.fetch = /** @type {any} */ (
        vi.fn(
            async () =>
                new Response(compressed, {
                    status: 200,
                })
        )
    );

    const source = new UrlSource(
        {
            url: "example.tsv.bgz",
        },
        createViewStub()
    );

    expect(await collectSource(source)).toEqual([
        {
            chrom: "chr2",
            start: 20,
        },
    ]);
});

test("UrlSource reads gzip-compressed URL lists transparently", async () => {
    const list = await gzipText("url\npart-1.tsv\npart-2.tsv\n");
    const part1 = await gzipText("sample\tvalue\nA\t1\n");
    const part2 = await gzipText("sample\tvalue\nB\t2\n");

    global.fetch = /** @type {any} */ (
        vi.fn(async (url) => {
            if (url == "/data/variants.tsv.gz") {
                return new Response(list, {
                    status: 200,
                    headers: {
                        "Content-Type": "application/gzip",
                    },
                });
            } else if (url == "/data/part-1.tsv") {
                return new Response(part1, {
                    status: 200,
                    headers: {
                        "Content-Type": "application/x-gzip",
                    },
                });
            } else if (url == "/data/part-2.tsv") {
                return new Response(part2, {
                    status: 200,
                    headers: {
                        "Content-Type": "application/x-gzip",
                    },
                });
            } else {
                throw new Error(`Unexpected URL: ${url}`);
            }
        })
    );

    const source = new UrlSource(
        {
            url: { urlsFromFile: "/data/variants.tsv.gz", type: "tsv" },
            format: { type: "tsv" },
        },
        createViewStub()
    );

    expect(await collectSource(source)).toEqual([
        {
            sample: "A",
            value: 1,
        },
        {
            sample: "B",
            value: 2,
        },
    ]);
});
