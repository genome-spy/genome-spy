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
