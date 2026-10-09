import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ViewParamRuntime from "../../../paramRuntime/viewParamRuntime.js";
import Collector from "../../collector.js";
import Gff3Source from "./gff3Source.js";
import TabixTsvSource from "./tabixTsvSource.js";
import VcfSource from "./vcfSource.js";

const fixtureDirectory = new URL(
    "../../../../testFixtures/tabix/",
    import.meta.url
);

/** @type {(Gff3Source | TabixTsvSource | VcfSource)[]} */
let sources = [];

beforeEach(() => {
    // Serve real BGZF/TBI bytes at the HTTP boundary. The readers and parsers
    // run unmocked, without requiring network access or HTSlib in the test run.
    const nativeFetch = globalThis.fetch;
    vi.stubGlobal(
        "fetch",
        async (
            /** @type {string} */ url,
            /** @type {RequestInit} */ init = {}
        ) => {
            if (url.startsWith("data:")) return nativeFetch(url, init);
            init.signal?.throwIfAborted();
            const name = new URL(url).pathname.slice(1);
            const bytes = readFileSync(new URL(name, fixtureDirectory));
            const range = new Headers(init.headers).get("range");
            if (!range) {
                return new Response(Uint8Array.from(bytes));
            }

            const [start, last] = range
                .slice("bytes=".length)
                .split("-")
                .map(Number);
            const end = Math.min(last + 1, bytes.length);
            return new Response(Uint8Array.from(bytes.subarray(start, end)), {
                status: 206,
                headers: {
                    "content-range": `bytes ${start}-${end - 1}/${bytes.length}`,
                },
            });
        }
    );
    vi.stubGlobal("window", { setTimeout, clearTimeout });
});

afterEach(() => {
    for (const source of sources) source.dispose();
    sources = [];
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

/**
 * @param {typeof Gff3Source | typeof TabixTsvSource | typeof VcfSource} Source
 * @param {import("../../../spec/data.js").Gff3Data | import("../../../spec/data.js").TabixTsvData | import("../../../spec/data.js").VcfData} params
 * @param {string} [chromosome]
 */
function createSource(Source, params, chromosome = "chr1") {
    /** @type {any} */
    let scaleResolution;
    const paramRuntime = new ViewParamRuntime(
        () => undefined,
        () => scaleResolution
    );
    const setPrefix = paramRuntime.allocateSetter(
        "prefix",
        /** @type {boolean | string} */ (false)
    );
    const scale = /** @type {any} */ (
        /** @returns {undefined} */ () => undefined
    );
    scale.type = "locus";
    scale.genome = () => ({
        totalSize: 10000,
        continuousToDiscreteChromosomeIntervals: (
            /** @type {number[]} */ interval
        ) => [
            { chrom: chromosome, startPos: interval[0], endPos: interval[1] },
        ],
    });
    scaleResolution = {
        addEventListener: /** @returns {undefined} */ () => undefined,
        getAxisLength: () => 100,
        getDomain: () => [100, 101],
        getScale: () => scale,
    };

    /** @type {{status: string, detail?: string}[]} */
    const statuses = [];
    const view = {
        paramRuntime,
        getBaseUrl: () => "https://tabix.test/",
        getScaleResolution: () => scaleResolution,
        isVisible: () => true,
        context: {
            addBroadcastListener: /** @returns {undefined} */ () => undefined,
            dataFlow: {
                loadingStatusRegistry: {
                    setSource: (
                        /** @type {any} */ _view,
                        /** @type {string} */ status,
                        /** @type {string | undefined} */ detail
                    ) => statuses.push({ status, detail }),
                },
            },
        },
    };
    const source = new Source(
        { ...params, debounce: 0, windowSize: 1 },
        /** @type {any} */ (view)
    );
    sources.push(source);
    const collector = new Collector();
    source.addChild(collector);

    return {
        source,
        collector,
        paramRuntime,
        setPrefix,
        setChromosome: (/** @type {string} */ name) => {
            chromosome = name;
        },
        statuses,
    };
}

it.each([
    {
        label: "default",
        prefix: undefined,
        chromosome: "1",
        raw: "1",
        id: "snp",
    },
    {
        label: "disabled",
        prefix: false,
        chromosome: "chr1",
        raw: "chr1",
        id: "prefixed",
    },
    { label: "empty", prefix: "", chromosome: "1", raw: "1", id: "snp" },
    { label: "chr", prefix: true, chromosome: "chr1", raw: "1", id: "snp" },
    {
        label: "custom",
        prefix: "scaffold_",
        chromosome: "scaffold_1",
        raw: "1",
        id: "snp",
    },
    {
        label: "already prefixed",
        prefix: true,
        chromosome: "chrchr1",
        raw: "chr1",
        id: "prefixed",
    },
])(
    "loads real VCF with $label prefixing and preserves record names",
    async ({ prefix, chromosome, raw, id }) => {
        const { source, collector, statuses } = createSource(
            VcfSource,
            {
                type: "vcf",
                url: "variants.vcf.gz",
                addChrPrefix: prefix,
            },
            chromosome
        );

        await source.requestInterval([100, 101]);

        expect(statuses.at(-1)).toEqual({
            status: "complete",
            detail: undefined,
        });
        expect(Array.from(collector.getData())).toMatchObject([
            {
                CHROM: raw,
                POS: 101,
                ID: [id],
                SAMPLES: { TUMOR: { GT: ["0/1"] } },
            },
        ]);
    }
);

it("preserves VCF overlap and half-open query boundaries", async () => {
    const { source, collector, statuses } = createSource(VcfSource, {
        type: "vcf",
        url: "variants.vcf.gz",
        addChrPrefix: true,
    });
    const ids = () => Array.from(collector.getData(), (datum) => datum.ID[0]);

    await source.requestInterval([101, 104]);
    expect(ids()).toEqual([]);
    await source.requestInterval([106, 107]);
    expect(ids()).toEqual(["del"]);
    await source.requestInterval([120, 130]);
    expect(ids()).toEqual(["sv"]);
    await source.requestInterval([130, 131]);
    expect(ids()).toEqual([]);
    expect(statuses.at(-1).status).toBe("complete");
});

it("preserves GFF3 hierarchy and original feature chromosome names", async () => {
    const { source, collector, statuses } = createSource(Gff3Source, {
        type: "gff3",
        url: "genes.gff3.gz",
        addChrPrefix: true,
    });

    await source.requestInterval([100, 120]);

    expect(statuses.at(-1).status).toBe("complete");
    expect(Array.from(collector.getData())).toMatchObject([
        [
            {
                seq_id: "1",
                type: "gene",
                start: 101,
                end: 120,
                child_features: [
                    [
                        {
                            seq_id: "1",
                            type: "mRNA",
                            child_features: [[{ seq_id: "1", type: "exon" }]],
                        },
                    ],
                ],
            },
        ],
    ]);
});

it("keeps prefix maps separate for files with different reference names", async () => {
    const { source, collector, setChromosome, statuses } = createSource(
        TabixTsvSource,
        {
            type: "tabix",
            url: ["intervals.tsv.gz", "prefixed.tsv.gz"],
            addChrPrefix: true,
        }
    );

    await source.requestInterval([100, 101]);
    expect(Array.from(collector.getData())).toEqual([
        { chrom: "1", start: 100, end: 110, value: "alpha" },
    ]);
    setChromosome("chrchr1");
    await source.requestInterval([100, 101]);
    expect(Array.from(collector.getData())).toEqual([
        { chrom: "chr1", start: 100, end: 110, value: "beta" },
    ]);
    setChromosome("1");
    await source.requestInterval([100, 101]);
    expect(Array.from(collector.getData())).toEqual([]);
    expect(statuses.at(-1).status).toBe("complete");
    expect(source.isDataReadyForDomain({ x: [100, 101] })).toBe(true);
});

it("preserves mappings across reactive prefix changes and handle reuse", async () => {
    vi.useFakeTimers();
    const { source, collector, setPrefix, paramRuntime } = createSource(
        VcfSource,
        {
            type: "vcf",
            url: "variants.vcf.gz",
            addChrPrefix: /** @type {any} */ ({ expr: "prefix" }),
        }
    );
    const chromosome = () =>
        Array.from(collector.getData(), (datum) => datum.CHROM);

    await source.requestInterval([100, 101]);
    expect(chromosome()).toEqual(["chr1"]);
    // Literal "true"/"false" prefixes must not share handles with booleans.
    for (const [
        prefix,
        expected,
    ] of /** @type {[boolean | string, string[]][]} */ ([
        [true, ["1"]],
        ["true", []],
        ["chr", ["1"]],
        [false, ["chr1"]],
        ["false", []],
        [false, ["chr1"]],
    ])) {
        setPrefix(prefix);
        await paramRuntime.whenPropagated();
        await vi.runAllTimersAsync();
        expect(chromosome()).toEqual(expected);
    }
});
