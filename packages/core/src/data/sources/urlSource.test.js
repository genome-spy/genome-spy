import { afterEach, expect, test, vi } from "vitest";
import { tableFromArrays, tableToIPC } from "@uwdata/flechette";
import { formats as vegaFormats } from "vega-loader";
import Collector from "../collector.js";
import { makeParamRuntimeProvider } from "../flowTestUtils.js";
import "../formats/arrow.js";
import bed from "../formats/bed.js";
import bedpe from "../formats/bedpe.js";
import "../formats/wig.js";
import "../formats/vcf.js";
import UrlSource from "./urlSource.js";

vegaFormats("bed", bed);
vegaFormats("bedpe", bedpe);

/** @type {typeof global.fetch | undefined} */
let originalFetch = global.fetch;

afterEach(() => {
    if (originalFetch) {
        global.fetch = originalFetch;
    }
    vi.restoreAllMocks();
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
    /** @type {{ status?: string, detail?: string }} */
    const loadingStatus = {};
    /** @type {import("../../view/view.js").default} */
    const view = /** @type {any} */ (
        Object.assign(makeParamRuntimeProvider(), {
            getBaseUrl: () => "",
            context: {
                dataFlow: {
                    loadingStatusRegistry: {
                        /**
                         * @param {string} status
                         * @param {string} [detail]
                         */
                        set: (/** @type {any} */ _view, status, detail) => {
                            loadingStatus.status = status;
                            loadingStatus.detail = detail;
                        },
                    },
                },
            },
        })
    );
    /** @type {any} */ (view).loadingStatus = loadingStatus;
    return view;
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

test("UrlSource infers and reads WIG data", async () => {
    const text = `fixedStep chrom=chr1 start=10 step=5 span=2
1.5
-2`;

    global.fetch = /** @type {any} */ (
        vi.fn(async () => new Response(text, { status: 200 }))
    );

    const source = new UrlSource(
        {
            url: "example.wig",
        },
        createViewStub()
    );

    expect(await collectSource(source)).toEqual([
        { chrom: "chr1", start: 9, end: 11, score: 1.5 },
        { chrom: "chr1", start: 14, end: 16, score: -2 },
    ]);
});

test("UrlSource infers and reads Arrow IPC data", async () => {
    const bytes = tableToIPC(
        tableFromArrays({
            sample: ["S1", "S2"],
            value: [10, 20],
        }),
        { format: "file" }
    );

    global.fetch = /** @type {any} */ (
        vi.fn(
            async () =>
                new Response(new Uint8Array(bytes).buffer, { status: 200 })
        )
    );

    const source = new UrlSource(
        {
            url: "example.arrow",
        },
        createViewStub()
    );

    expect(await collectSource(source)).toEqual([
        { sample: "S1", value: 10 },
        { sample: "S2", value: 20 },
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

test("UrlSource infers and reads a gzip-compressed VCF", async () => {
    const text = `##fileformat=VCFv4.3
#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO
chr1\t101\trs1\tA\tT\t50\tPASS\t.`;
    const compressed = await gzipText(text);

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
            url: "example.vcf.gz",
        },
        createViewStub()
    );

    expect(await collectSource(source)).toMatchObject([
        {
            CHROM: "chr1",
            POS: 101,
            ID: ["rs1"],
            REF: "A",
            ALT: ["T"],
            QUAL: 50,
            FILTER: "PASS",
            INFO: {},
            SAMPLES: {},
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

test("UrlSource accepts explicit columns for headerless TSV", async () => {
    global.fetch = /** @type {any} */ (
        vi.fn(async () => new Response("chr1\t10\nchr2\t20\n", { status: 200 }))
    );

    const source = new UrlSource(
        {
            url: "example.tsv",
            format: {
                type: "tsv",
                columns: ["chrom", "start"],
            },
        },
        createViewStub()
    );

    expect(await collectSource(source)).toEqual([
        {
            chrom: "chr1",
            start: 10,
        },
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

test("UrlSource expands URL templates and attaches descriptor fields", async () => {
    global.fetch = /** @type {any} */ (
        vi.fn(async (url) => {
            if (url == "segments/A.tsv") {
                return new Response("start\tend\n1\t2\n", { status: 200 });
            }
            if (url == "segments/B.tsv") {
                return new Response("start\tend\n3\t4\n", { status: 200 });
            }
            throw new Error(`Unexpected URL: ${url}`);
        })
    );

    const source = new UrlSource(
        {
            url: {
                template: "segments/{sample}.tsv",
                values: ["A", "B"],
                field: "sample",
            },
            format: { type: "tsv" },
        },
        createViewStub()
    );

    expect(await collectSource(source)).toEqual([
        { sample: "A", start: 1, end: 2 },
        { sample: "B", start: 3, end: 4 },
    ]);
});

test("UrlSource treats maxValues overflow as empty completed data", async () => {
    global.fetch = /** @type {any} */ (vi.fn());

    const view = createViewStub();
    const source = new UrlSource(
        {
            url: {
                template: "segments/{sample}.tsv",
                values: ["A", "B"],
                field: "sample",
                maxValues: 1,
            },
            format: { type: "tsv" },
        },
        view
    );

    expect(await collectSource(source)).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(/** @type {any} */ (view).loadingStatus).toEqual({
        status: "complete",
        detail: undefined,
    });
});

test("UrlSource skips failed template URLs when configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    global.fetch = /** @type {any} */ (
        vi.fn(async (url) => {
            if (url == "segments/missing.tsv") {
                return new Response("Not found", {
                    status: 404,
                    statusText: "Not Found",
                });
            }
            return new Response("value\n1\n", { status: 200 });
        })
    );

    const view = createViewStub();
    const source = new UrlSource(
        {
            url: {
                template: "segments/{patient}.tsv",
                values: ["patient1", "missing"],
                field: "patient",
                onLoadError: "skip",
            },
            format: { type: "tsv" },
        },
        view
    );

    expect(await collectSource(source)).toEqual([
        { patient: "patient1", value: 1 },
    ]);
    expect(/** @type {any} */ (view).loadingStatus).toEqual({
        status: "complete",
        detail: undefined,
    });
    expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Skipping failed URL: segments/missing.tsv"),
        expect.any(Error)
    );
});

test("UrlSource can expand URL templates without attaching fields", async () => {
    global.fetch = /** @type {any} */ (
        vi.fn(
            async () => new Response("sample\tvalue\nS1\t1\n", { status: 200 })
        )
    );

    const source = new UrlSource(
        {
            url: {
                template: "variants/{patient}.tsv",
                values: ["patient1"],
                field: "patient",
                attach: false,
            },
            format: { type: "tsv" },
        },
        createViewStub()
    );

    expect(await collectSource(source)).toEqual([{ sample: "S1", value: 1 }]);
});

test("UrlSource reports conflicting template fields", async () => {
    global.fetch = /** @type {any} */ (
        vi.fn(
            async () => new Response("sample\tvalue\nB\t1\n", { status: 200 })
        )
    );
    // The conflict is expected; keep its diagnostic out of the test runner output.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const view = createViewStub();
    const source = new UrlSource(
        {
            url: {
                template: "segments/{sample}.tsv",
                values: ["A"],
                field: "sample",
            },
            format: { type: "tsv" },
        },
        view
    );

    await source.load();

    expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
            message: 'Descriptor field "sample" conflicts with loaded datum.',
        })
    );
    expect(/** @type {any} */ (view).loadingStatus).toEqual({
        status: "error",
        detail: expect.stringContaining(
            'Descriptor field "sample" conflicts with loaded datum.'
        ),
    });
});

test("an older request cannot republish after its replacement completes", async () => {
    const older = Promise.withResolvers();
    global.fetch = vi.fn(async (url) =>
        url === "a.json" ? older.promise : new Response('[{"value":"B"}]')
    );
    const source = new UrlSource({ url: "a.json" }, createViewStub());
    const collector = new Collector();
    source.addChild(collector);

    const a = source.load();
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledWith("a.json"));

    source.params.url = "b.json";
    await source.load();
    older.resolve(new Response('[{"value":"A"}]'));
    await a;

    expect(Array.from(collector.getData())).toEqual([{ value: "B" }]);
    // Stale completion can publish another revision even when rows still look correct.
    expect(collector.dataRevision).toBe(1);
});

test.each([false, true])(
    "superseded load cannot publish while a newer load is pending (reject: %s)",
    async (reject) => {
        const a = Promise.withResolvers();
        const b = Promise.withResolvers();
        global.fetch = vi.fn(async (url) =>
            url === "a.json" ? a.promise : b.promise
        );
        const view = createViewStub();
        const source = new UrlSource({ url: "a.json" }, view);
        const collector = new Collector();
        source.addChild(collector);

        const first = source.load();
        await vi.waitFor(() =>
            expect(global.fetch).toHaveBeenCalledWith("a.json")
        );

        source.params.url = "b.json";
        const second = source.load();
        if (reject) {
            a.reject(new Error("old failure"));
        } else {
            a.resolve(new Response('[{"value":"A"}]'));
        }
        await first;
        expect(collector.completed).toBe(false);
        expect(/** @type {any} */ (view).loadingStatus.status).toBe("loading");
        b.resolve(new Response('[{"value":"B"}]'));
        await second;

        expect(Array.from(collector.getData())).toEqual([{ value: "B" }]);
    }
);

test("disposal prevents pending URL publication and future loading", async () => {
    const response = Promise.withResolvers();
    global.fetch = vi.fn(async () => response.promise);
    const view = createViewStub();
    const source = new UrlSource({ url: "a.json" }, view);
    const collector = new Collector();
    source.addChild(collector);

    const pending = source.load();
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    source.dispose();
    response.resolve(new Response('[{"value":"A"}]'));
    await pending;
    await source.load();

    expect(collector.dataRevision).toBe(0);
    expect(global.fetch).toHaveBeenCalledTimes(1);
});

test("a superseded asynchronous format reader cannot emit a file batch", async () => {
    const parsed = Promise.withResolvers();
    const started = Promise.withResolvers();
    const reader = (/** @type {string} */ text) => {
        if (text === "A") {
            started.resolve();
            return parsed.promise;
        }
        return [{ value: text }];
    };
    vegaFormats("url-race-fixture", reader);
    global.fetch = vi.fn(
        async (url) => new Response(url === "a.data" ? "A" : "B")
    );
    const source = new UrlSource(
        {
            url: "a.data",
            format: { type: /** @type {any} */ ("url-race-fixture") },
        },
        createViewStub()
    );
    const collector = new Collector();
    source.addChild(collector);

    const first = source.load();
    await started.promise;

    source.params.url = "b.data";
    await source.load();
    parsed.resolve([{ value: "A" }]);
    await first;

    expect(Array.from(collector.getData())).toEqual([{ value: "B" }]);
    expect(collector.dataRevision).toBe(1);
});

test("superseded fetched content never invokes its format reader", async () => {
    const response = Promise.withResolvers();
    const reader = vi.fn((text) => [{ value: text }]);
    vegaFormats("url-stale-parse-fixture", reader);
    global.fetch = vi.fn(async (url) =>
        url === "a.data" ? response.promise : new Response("B")
    );
    const source = new UrlSource(
        {
            url: "a.data",
            format: { type: /** @type {any} */ ("url-stale-parse-fixture") },
        },
        createViewStub()
    );
    const collector = new Collector();
    source.addChild(collector);
    const first = source.load();
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledWith("a.data"));
    source.params.url = "b.data";
    await source.load();
    response.resolve(new Response("A"));
    await first;

    expect(reader).toHaveBeenCalledTimes(1);
    expect(reader.mock.calls[0][0]).toBe("B");
    expect(Array.from(collector.getData())).toEqual([{ value: "B" }]);
});
