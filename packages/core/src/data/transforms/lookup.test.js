import { afterEach, expect, test, vi } from "vitest";
import Collector from "../collector.js";
import { processData } from "../flowTestUtils.js";
import InlineSource from "../sources/inlineSource.js";
import { createHeadlessEngine } from "../../view/testUtils.js";
import LookupTransform from "./lookup.js";

/**
 * @param {import("../flowNode.js").Datum[]} data
 */
function collect(data) {
    const collector = new Collector({ type: "collect" });
    for (const datum of data) {
        collector.handle(datum);
    }
    collector.complete();
    return collector;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

test("copies matching lookup values and applies defaults", () => {
    const lookup = new LookupTransform(
        {
            type: "lookup",
            from: { values: [] },
            key: "codon",
            fields: ["codon"],
            values: ["aminoAcid"],
            as: ["aminoAcid"],
            default: "?",
        },
        collect([
            { codon: "ATG", aminoAcid: "M" },
            { codon: "TGG", aminoAcid: "W" },
        ])
    );

    expect(processData(lookup, [{ codon: "ATG" }, { codon: "NNN" }])).toEqual([
        { codon: "ATG", aminoAcid: "M" },
        { codon: "NNN", aminoAcid: "?" },
    ]);
});

test("matches composite keys without conflating key value types", () => {
    const lookup = new LookupTransform(
        {
            type: "lookup",
            from: { values: [] },
            key: ["sample", "codon"],
            fields: ["sample", "codon"],
            values: ["label"],
            as: ["label"],
        },
        collect([
            { sample: 1, codon: "2", label: "number-string" },
            { sample: "1", codon: 2, label: "string-number" },
        ])
    );

    expect(
        processData(lookup, [
            { sample: 1, codon: "2" },
            { sample: "1", codon: 2 },
        ])
    ).toEqual([
        { sample: 1, codon: "2", label: "number-string" },
        { sample: "1", codon: 2, label: "string-number" },
    ]);
});

test("defaults fields to the foreign key and copies non-key table fields", () => {
    const lookup = new LookupTransform(
        {
            type: "lookup",
            from: { values: [] },
            key: "codon",
            fields: null,
            values: null,
        },
        collect([{ codon: "ATG", aminoAcid: "M", category: "start" }])
    );

    expect(processData(lookup, [{ codon: "ATG" }])).toEqual([
        { codon: "ATG", aminoAcid: "M", category: "start" },
    ]);
});

test("matches differently named single key fields", () => {
    const lookup = new LookupTransform(
        {
            type: "lookup",
            from: { values: [] },
            key: "id",
            fields: "codon",
            values: ["aminoAcid"],
        },
        collect([{ id: "ATG", aminoAcid: "M" }])
    );

    expect(processData(lookup, [{ codon: "ATG" }])).toEqual([
        { codon: "ATG", aminoAcid: "M" },
    ]);
});

test("matches forward and backward references within the same input batch", () => {
    const lookup = new LookupTransform({
        type: "lookup",
        from: { source: "input" },
        key: "ID[0]",
        fields: "INFO.MATE_ID[0]",
        values: ["CHROM", "POS"],
        as: ["mateChrom", "matePos"],
    });
    const input = [
        {
            ID: ["bnd-a"],
            CHROM: "chr1",
            POS: 101,
            INFO: { MATE_ID: ["bnd-b"] },
        },
        {
            ID: ["bnd-b"],
            CHROM: "chr2",
            POS: 202,
            INFO: { MATE_ID: ["bnd-a"] },
        },
    ];

    const output = processData(lookup, input);

    expect(output).toEqual([
        { ...input[0], mateChrom: "chr2", matePos: 202 },
        { ...input[1], mateChrom: "chr1", matePos: 101 },
    ]);
    expect(output.map((datum) => datum.ID[0])).toEqual(["bnd-a", "bnd-b"]);
    expect(output[0]).not.toBe(input[0]);
});

test("applies explicit defaults to missing self-input keys", () => {
    const lookup = new LookupTransform({
        type: "lookup",
        from: { source: "input" },
        key: "id",
        fields: "mate",
        values: ["label"],
        as: ["mateLabel"],
        default: "missing",
    });

    expect(
        processData(lookup, [
            { id: "a", mate: "b", label: "Alpha" },
            { id: "b", mate: "outside", label: "Beta" },
        ])
    ).toEqual([
        { id: "a", mate: "b", label: "Alpha", mateLabel: "Beta" },
        { id: "b", mate: "outside", label: "Beta", mateLabel: "missing" },
    ]);
});

test("supports implicit values in a self-input lookup", () => {
    const lookup = new LookupTransform({
        type: "lookup",
        from: { source: "input" },
        key: "id",
        fields: "mate",
    });

    expect(
        processData(lookup, [
            { id: "a", mate: "b", label: "Alpha" },
            { id: "b", mate: "a", label: "Beta" },
        ])
    ).toEqual([
        { id: "a", mate: "a", label: "Beta" },
        { id: "b", mate: "b", label: "Alpha" },
    ]);
});

test("matches composite self-input keys", () => {
    const lookup = new LookupTransform({
        type: "lookup",
        from: { source: "input" },
        key: ["sample", "id"],
        fields: ["sample", "mate"],
        values: ["label"],
        as: ["mateLabel"],
    });

    expect(
        processData(lookup, [
            { sample: "s1", id: 1, mate: 2, label: "first" },
            { sample: "s1", id: 2, mate: 1, label: "second" },
        ])
    ).toEqual([
        {
            sample: "s1",
            id: 1,
            mate: 2,
            label: "first",
            mateLabel: "second",
        },
        {
            sample: "s1",
            id: 2,
            mate: 1,
            label: "second",
            mateLabel: "first",
        },
    ]);
});

test("scopes self-input indexes and duplicate keys to individual batches", () => {
    const lookup = new LookupTransform({
        type: "lookup",
        from: { source: "input" },
        key: "id",
        fields: "mate",
        values: ["label"],
        as: ["mateLabel"],
        default: null,
    });
    const output = new Collector({ type: "collect" });
    lookup.addChild(output);

    lookup.beginBatch({ type: "file", url: "first.vcf" });
    lookup.handle({ id: "shared", mate: "later", label: "first-file" });
    expect(lookup.stats.count).toBe(0);

    lookup.beginBatch({ type: "file", url: "second.vcf" });
    expect(lookup.stats.count).toBe(1);
    lookup.handle({ id: "shared", mate: "shared", label: "second-file" });
    lookup.complete();

    expect([...output.getData()]).toEqual([
        {
            id: "shared",
            mate: "later",
            label: "first-file",
            mateLabel: null,
        },
        {
            id: "shared",
            mate: "shared",
            label: "second-file",
            mateLabel: "second-file",
        },
    ]);
});

test("rejects duplicate self-input keys within a batch", () => {
    const lookup = new LookupTransform({
        type: "lookup",
        from: { source: "input" },
        key: "id",
        fields: "mate",
        values: ["label"],
        as: ["mateLabel"],
    });

    expect(() =>
        processData(lookup, [
            { id: "duplicate", mate: "duplicate", label: "first" },
            { id: "duplicate", mate: "duplicate", label: "second" },
        ])
    ).toThrow(/Duplicate lookup key/);
});

test("handles empty self input", () => {
    const lookup = new LookupTransform({
        type: "lookup",
        from: { source: "input" },
        key: "id",
        values: ["label"],
    });

    expect(processData(lookup, [])).toEqual([]);
});

test("clears buffered self input and indexes on reset", () => {
    const lookup = new LookupTransform({
        type: "lookup",
        from: { source: "input" },
        key: "id",
        fields: "mate",
        values: ["label"],
        as: ["mateLabel"],
        default: "missing",
    });

    lookup.beginBatch({ type: "file", url: "aborted.vcf" });
    lookup.handle({ id: "stale", mate: "stale", label: "Stale" });
    lookup.reset();

    expect(
        processData(lookup, [{ id: "fresh", mate: "stale", label: "Fresh" }])
    ).toEqual([
        {
            id: "fresh",
            mate: "stale",
            label: "Fresh",
            mateLabel: "missing",
        },
    ]);
});

test("requires aligned primary and foreign key fields", () => {
    expect(
        () =>
            new LookupTransform(
                {
                    type: "lookup",
                    from: { values: [] },
                    key: ["sample", "codon"],
                    fields: "sample",
                    values: ["aminoAcid"],
                },
                collect([])
            )
    ).toThrow(/same number of fields/);
});

test("requires explicit values when using as", () => {
    expect(
        () =>
            new LookupTransform(
                {
                    type: "lookup",
                    from: { values: [] },
                    key: "codon",
                    as: ["aminoAcid"],
                },
                collect([])
            )
    ).toThrow(/requires explicit "values"/);
});

test("rejects empty explicit lookup values", () => {
    expect(
        () =>
            new LookupTransform(
                {
                    type: "lookup",
                    from: { values: [] },
                    key: "codon",
                    values: [],
                },
                collect([])
            )
    ).toThrow(/values.*must not be empty/);
});

test("requires top-level lookup keys when values are implicit", () => {
    const lookup = new LookupTransform(
        {
            type: "lookup",
            from: { values: [] },
            key: "sample.id",
            fields: "sampleId",
        },
        collect([{ sample: { id: "A" }, label: "Sample A" }])
    );

    expect(() => processData(lookup, [{ sampleId: "A" }])).toThrow(
        /requires top-level lookup key fields/
    );
});

test("rejects lookup output fields that collide with primary data", () => {
    const lookup = new LookupTransform(
        {
            type: "lookup",
            from: { values: [] },
            key: "codon",
        },
        collect([{ codon: "ATG", aminoAcid: "M" }])
    );

    expect(() =>
        processData(lookup, [{ codon: "ATG", aminoAcid: "unknown" }])
    ).toThrow(/already exists in primary data/);
});

test("uses as to avoid lookup output field collisions", () => {
    const lookup = new LookupTransform(
        {
            type: "lookup",
            from: { values: [] },
            key: "codon",
            values: ["aminoAcid"],
            as: ["translatedAminoAcid"],
        },
        collect([{ codon: "ATG", aminoAcid: "M" }])
    );

    expect(
        processData(lookup, [{ codon: "ATG", aminoAcid: "unknown" }])
    ).toEqual([
        {
            codon: "ATG",
            aminoAcid: "unknown",
            translatedAminoAcid: "M",
        },
    ]);
});

test("requires the foreign table to complete before primary data", () => {
    const foreign = new Collector({ type: "collect" });
    const lookup = new LookupTransform(
        {
            type: "lookup",
            from: { values: [] },
            key: "codon",
            fields: ["codon"],
            values: ["aminoAcid"],
        },
        foreign
    );
    expect(() => processData(lookup, [{ codon: "ATG" }])).toThrow(
        /must be loaded before primary data/
    );
});

test("uses refreshed table values after primary data is reloaded", () => {
    const foreign = collect([{ codon: "ATG", aminoAcid: "M" }]);
    const lookup = new LookupTransform(
        {
            type: "lookup",
            from: { values: [] },
            key: "codon",
            fields: ["codon"],
            values: ["aminoAcid"],
        },
        foreign
    );

    expect(processData(lookup, [{ codon: "ATG" }])).toEqual([
        { codon: "ATG", aminoAcid: "M" },
    ]);

    foreign.reset();
    foreign.handle({ codon: "ATG", aminoAcid: "Start" });
    foreign.complete();
    lookup.reset();

    expect(processData(lookup, [{ codon: "ATG" }])).toEqual([
        { codon: "ATG", aminoAcid: "Start" },
    ]);
});

test("keeps the lookup index when only primary data is reset", () => {
    const foreign = collect([{ codon: "ATG", aminoAcid: "M" }]);
    const getData = vi.spyOn(foreign, "getData");
    const lookup = new LookupTransform(
        {
            type: "lookup",
            from: { values: [] },
            key: "codon",
            values: ["aminoAcid"],
        },
        foreign
    );

    processData(lookup, [{ codon: "ATG" }]);
    lookup.reset();
    processData(lookup, [{ codon: "ATG" }]);

    expect(getData).toHaveBeenCalledTimes(1);
});

test("repropagates a buffered primary collector when the table reloads", () => {
    const foreign = collect([{ codon: "ATG", aminoAcid: "M" }]);
    const primary = new Collector({ type: "collect" });
    const lookup = new LookupTransform(
        {
            type: "lookup",
            from: { values: [] },
            key: "codon",
            fields: ["codon"],
            values: ["aminoAcid"],
        },
        foreign
    );
    const output = new Collector({ type: "collect" });
    primary.addChild(lookup);
    lookup.addChild(output);

    primary.handle({ codon: "ATG" });
    primary.complete();
    expect([...output.getData()]).toEqual([{ codon: "ATG", aminoAcid: "M" }]);

    foreign.reset();
    foreign.handle({ codon: "ATG", aminoAcid: "Start" });
    foreign.complete();

    expect([...output.getData()]).toEqual([
        { codon: "ATG", aminoAcid: "Start" },
    ]);
});

test("reloads the primary source when the table reloads", async () => {
    const foreign = collect([{ codon: "ATG", aminoAcid: "M" }]);
    const primary = new InlineSource(
        { values: [{ codon: "ATG" }] },
        /** @type {any} */ ({})
    );
    const lookup = new LookupTransform(
        {
            type: "lookup",
            from: { values: [] },
            key: "codon",
            fields: ["codon"],
            values: ["aminoAcid"],
        },
        foreign
    );
    const output = new Collector({ type: "collect" });
    primary.addChild(lookup);
    lookup.addChild(output);
    const load = vi.spyOn(primary, "load");

    await primary.load();
    foreign.reset();
    foreign.handle({ codon: "ATG", aminoAcid: "Start" });
    foreign.complete();
    await Promise.resolve();

    expect(load).toHaveBeenCalledTimes(2);
    expect([...output.getData()]).toEqual([
        { codon: "ATG", aminoAcid: "Start" },
    ]);
});

test("reloads primary data after a lookup URL parameter changes", async () => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url) => {
            if (url == "first.csv") {
                return new Response("codon,aminoAcid\nATG,M\n");
            } else if (url == "second.csv") {
                return new Response("codon,aminoAcid\nATG,Start\n");
            }
            throw new Error(`Unexpected URL: ${url}`);
        })
    );

    const { view } = await createHeadlessEngine({
        params: [{ name: "tableUrl", value: "first.csv" }],
        data: { values: [{ codon: "ATG" }] },
        transform: [
            {
                type: "lookup",
                from: {
                    url: { expr: "tableUrl" },
                    format: { type: "csv" },
                },
                key: "codon",
                fields: ["codon"],
                values: ["aminoAcid"],
            },
        ],
        mark: "point",
        encoding: {
            x: { field: "codon", type: "nominal" },
            y: { field: "aminoAcid", type: "nominal" },
        },
    });

    view.paramRuntime.setValue("tableUrl", "second.csv");

    await vi.waitFor(() => {
        expect([...view.flowHandle.collector.getData()]).toMatchObject([
            { codon: "ATG", aminoAcid: "Start" },
        ]);
    });
});

test("rejects duplicate foreign keys", () => {
    const lookup = new LookupTransform(
        {
            type: "lookup",
            from: { values: [] },
            key: "codon",
            fields: ["codon"],
            values: ["aminoAcid"],
        },
        collect([
            { codon: "ATG", aminoAcid: "M" },
            { codon: "ATG", aminoAcid: "Start" },
        ])
    );

    expect(() => processData(lookup, [{ codon: "ATG" }])).toThrow(
        /Duplicate lookup key/
    );
});

test("loads an inline lookup table without a separate view", async () => {
    const { view, context } = await createHeadlessEngine({
        data: { values: [{ codon: "ATG" }, { codon: "TGG" }] },
        transform: [
            {
                type: "lookup",
                from: {
                    values: [
                        { codon: "ATG", aminoAcid: "M" },
                        { codon: "TGG", aminoAcid: "W" },
                    ],
                },
                key: "codon",
                fields: ["codon"],
                values: ["aminoAcid"],
            },
        ],
        mark: "point",
        encoding: {
            x: { field: "codon", type: "nominal" },
            y: { field: "aminoAcid", type: "nominal" },
        },
    });

    expect([...view.flowHandle.collector.getData()]).toMatchObject([
        { codon: "ATG", aminoAcid: "M" },
        { codon: "TGG", aminoAcid: "W" },
    ]);
    expect(context.dataFlow.dataSources).toHaveLength(2);

    view.disposeSubtree();
    expect(context.dataFlow.dataSources).toHaveLength(0);
    expect(context.dataFlow.collectors).toHaveLength(0);
});

test("loads a CSV lookup table through the regular data source", async () => {
    vi.stubGlobal(
        "fetch",
        vi
            .fn()
            .mockResolvedValue(new Response("codon,aminoAcid\nATG,M\nTGG,W\n"))
    );

    const { view } = await createHeadlessEngine({
        data: { values: [{ codon: "ATG" }, { codon: "TGG" }] },
        transform: [
            {
                type: "lookup",
                from: {
                    url: "data/genetic-code.csv",
                    format: { type: "csv" },
                },
                key: "codon",
                fields: ["codon"],
                values: ["aminoAcid"],
            },
        ],
        mark: "point",
        encoding: {
            x: { field: "codon", type: "nominal" },
            y: { field: "aminoAcid", type: "nominal" },
        },
    });

    expect([...view.flowHandle.collector.getData()]).toMatchObject([
        { codon: "ATG", aminoAcid: "M" },
        { codon: "TGG", aminoAcid: "W" },
    ]);
});

test("loads and parses each VCF once while matching within file batches", async () => {
    const header = `##fileformat=VCFv4.3
##INFO=<ID=SVTYPE,Number=1,Type=String,Description="Type">
##INFO=<ID=MATE_ID,Number=1,Type=String,Description="Mate identifier">
#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO`;
    const first =
        header +
        "\nchr1\t101\tbnd1\tN\tN]chr2:202]\t60\tPASS\tSVTYPE=BND;MATE_ID=bnd2" +
        "\nchr2\t202\tbnd2\tN\tN]chr1:101]\t60\tPASS\tSVTYPE=BND;MATE_ID=bnd1\n";
    const second =
        header +
        "\nchr3\t303\tbnd1\tN\tN]chr4:404]\t60\tPASS\tSVTYPE=BND;MATE_ID=bnd2" +
        "\nchr4\t404\tbnd2\tN\tN]chr3:303]\t60\tPASS\tSVTYPE=BND;MATE_ID=bnd1\n";
    const fetchMock = vi.fn(async (url) => {
        if (url == "first.vcf") {
            return new Response(first);
        } else if (url == "second.vcf") {
            return new Response(second);
        }
        throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { view, context } = await createHeadlessEngine({
        data: {
            url: ["first.vcf", "second.vcf"],
            format: { type: "vcf" },
        },
        transform: [
            {
                type: "lookup",
                from: { source: "input" },
                key: "ID[0]",
                fields: "INFO.MATE_ID[0]",
                values: ["CHROM", "POS"],
                as: ["mateChrom", "matePos"],
            },
        ],
        mark: "point",
        encoding: {
            x: { field: "CHROM", type: "nominal" },
            y: { field: "matePos", type: "quantitative" },
        },
    });

    expect([...view.flowHandle.collector.getData()]).toMatchObject([
        { CHROM: "chr1", mateChrom: "chr2", matePos: 202 },
        { CHROM: "chr2", mateChrom: "chr1", matePos: 101 },
        { CHROM: "chr3", mateChrom: "chr4", matePos: 404 },
        { CHROM: "chr4", mateChrom: "chr3", matePos: 303 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(context.dataFlow.dataSources).toHaveLength(1);
});

test("rejects lazy lookup tables", async () => {
    await expect(
        createHeadlessEngine({
            data: { values: [{ codon: "ATG" }] },
            transform: [
                {
                    type: "lookup",
                    from: { lazy: { type: "axisGenome", channel: "x" } },
                    key: "name",
                    fields: ["codon"],
                    values: ["name"],
                },
            ],
            mark: "point",
            encoding: {
                x: { field: "codon", type: "nominal" },
                y: { field: "name", type: "nominal" },
            },
        })
    ).rejects.toThrow(/Lookup tables cannot use lazy data sources/);
});
