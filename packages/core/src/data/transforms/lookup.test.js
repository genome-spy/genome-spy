import { afterEach, expect, test, vi } from "vitest";
import Collector from "../collector.js";
import { processData } from "../flowTestUtils.js";
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
            from: { data: { values: [] }, key: "codon" },
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
            from: { data: { values: [] }, key: ["sample", "codon"] },
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

test("requires aligned primary and foreign key fields", () => {
    expect(
        () =>
            new LookupTransform(
                {
                    type: "lookup",
                    from: { data: { values: [] }, key: ["sample", "codon"] },
                    fields: ["sample"],
                    values: ["aminoAcid"],
                },
                collect([])
            )
    ).toThrow(/same number of fields/);
});

test("writes matching rows when values are omitted", () => {
    const foreignDatum = { codon: "ATG", aminoAcid: "M" };
    const lookup = new LookupTransform(
        {
            type: "lookup",
            from: { data: { values: [] }, key: "codon" },
            fields: ["codon"],
            as: ["translation"],
        },
        collect([foreignDatum])
    );

    expect(processData(lookup, [{ codon: "ATG" }])).toEqual([
        { codon: "ATG", translation: foreignDatum },
    ]);
});

test("waits for the foreign table and rejoins when it refreshes", () => {
    const foreign = new Collector({ type: "collect" });
    const lookup = new LookupTransform(
        {
            type: "lookup",
            from: { data: { values: [] }, key: "codon" },
            fields: ["codon"],
            values: ["aminoAcid"],
        },
        foreign
    );
    const output = new Collector({ type: "collect" });
    lookup.addChild(output);

    lookup.handle({ codon: "ATG" });
    lookup.complete();
    expect(output.completed).toBe(false);

    foreign.handle({ codon: "ATG", aminoAcid: "M" });
    foreign.complete();
    expect([...output.getData()]).toEqual([{ codon: "ATG", aminoAcid: "M" }]);

    foreign.reset();
    foreign.handle({ codon: "ATG", aminoAcid: "Start" });
    foreign.complete();
    expect([...output.getData()]).toEqual([
        { codon: "ATG", aminoAcid: "Start" },
    ]);
});

test("rejects duplicate foreign keys", () => {
    const lookup = new LookupTransform(
        {
            type: "lookup",
            from: { data: { values: [] }, key: "codon" },
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
                    data: {
                        values: [
                            { codon: "ATG", aminoAcid: "M" },
                            { codon: "TGG", aminoAcid: "W" },
                        ],
                    },
                    key: "codon",
                },
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
                    data: {
                        url: "data/genetic-code.csv",
                        format: { type: "csv" },
                    },
                    key: "codon",
                },
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
