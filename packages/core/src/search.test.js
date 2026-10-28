import { expect, test, vi, onTestFinished } from "vitest";
import { createDatumSearch } from "./search.js";
import { createTestEmbed } from "./view/embedTestUtils.js";
import { createHeadlessViewHierarchy } from "./genomeSpy/headlessBootstrap.js";
import { createViewMutationApi } from "./view/viewMutationApi.js";

/** @param {string} name @param {string} [searchField] @returns {import("./spec/view.js").UnitSpec} */
function genes(name, searchField = "symbol") {
    return {
        name,
        data: {
            values: [
                {
                    chrom: "chrA",
                    start: 10,
                    end: 20,
                    other: 5,
                    symbol: "TP53",
                    alias: "p53",
                    nested: { note: "original" },
                },
                {
                    chrom: "chrA",
                    start: 30,
                    end: 40,
                    other: 10,
                    symbol: "tp53",
                    alias: "P53",
                },
                {
                    chrom: "chrB",
                    start: 1,
                    end: 2,
                    other: 15,
                    symbol: "chr1:0",
                    alias: null,
                },
            ],
        },
        mark: "rect",
        encoding: {
            x: {
                chrom: "chrom",
                pos: "start",
                type: "locus",
                scale: {
                    assembly: {
                        contigs: [
                            { name: "chrA", size: 100 },
                            { name: "chrB", size: 200 },
                        ],
                    },
                    zoom: true,
                },
            },
            x2: { chrom: "chrom", pos: "end" },
            y: {
                field: "other",
                type: "locus",
                scale: {
                    assembly: { contigs: [{ name: "scaffold", size: 50 }] },
                    zoom: true,
                },
            },
            search: [{ field: searchField }, { field: "alias" }],
        },
    };
}

test("returns detached multiple loci and independent x/y targets without mutation", async () => {
    const { views, root } = await createTestEmbed(genes("genes"));
    const search = createDatumSearch(views);
    const handle = views.get({ scope: [], view: "genes" });
    const x = root.getScaleResolution("x");
    const before = x.getDomain();
    const listener = vi.fn();
    x.addEventListener("domain", listener);
    const result = search.findDatums("Tp53", { limit: 10 });
    expect(result.matches).toHaveLength(2);
    expect(result.truncated).toBe(false);
    expect(result.matches[0]).toMatchObject({
        view: handle,
        fields: ["symbol"],
        targets: [
            { kind: "locus", channel: "x", interval: [10, 20], zoomable: true },
            { kind: "locus", channel: "y", interval: [5, 6], zoomable: true },
        ],
    });
    expect(result.sources[0]).toMatchObject({
        readiness: "ready",
        scan: "complete",
        rowsExamined: 3,
        coverage: "loaded",
    });
    expect(result.matches[0].datum).not.toHaveProperty("__uniqueId");
    /** @type {{note: string}} */ (result.matches[0].datum.nested).note =
        "changed";
    expect(handle.data.read({ scope: "all", limit: 1 }).rows[0].nested).toEqual(
        { note: "original" }
    );
    expect(x.getDomain()).toEqual(before);
    expect(listener).not.toHaveBeenCalled();
    expect(
        search.findDatums("chr1:0", { limit: 10 }).matches[0].datum.symbol
    ).toBe("chr1:0");
    expect(
        search.findDatums("p5", { mode: "prefix", field: "alias", limit: 10 })
            .matches
    ).toHaveLength(2);
});

test("bounds results globally and reports partial, unscanned, and excluded sources", async () => {
    const { views } = await createTestEmbed({
        resolve: { scale: { x: "independent", y: "independent" } },
        vconcat: [genes("first"), genes("second", "alias")],
    });
    const search = createDatumSearch(views);
    const bounded = search.findDatums("TP53", { limit: 1 });
    expect(bounded.matches).toHaveLength(1);
    expect(bounded.truncated).toBe(true);
    expect(bounded.sources.map((source) => source.scan)).toEqual([
        "partial",
        "unscanned",
    ]);
    expect(search.findDatums("TP53", { limit: 0 }).truncated).toBe(true);
    const exact = search.findDatums("TP53", {
        limit: 2,
        field: "symbol",
        view: views.root(),
    });
    expect(exact.matches).toHaveLength(2);
    expect(exact.truncated).toBe(false);
    expect(exact.sources[1].scan).toBe("excluded");
    expect(() =>
        search.findDatums("TP53", { limit: 2, field: "absent" })
    ).toThrow(/field/);
    expect(() => search.findDatums("", { limit: 2 })).toThrow(/non-empty/);
    expect(() => search.findDatums("TP53", { limit: -1 })).toThrow(/Limit/);
});

test("supports transformed fields and literal lookup without any locus scale", async () => {
    const { views } = await createTestEmbed({
        name: "plain",
        data: { values: [{ symbol: "tp53", start: 5, end: 10 }] },
        transform: [
            { type: "formula", expr: "upper(datum.symbol)", as: "label" },
        ],
        mark: "rect",
        encoding: {
            x: { field: "start", type: "quantitative", scale: { zoom: true } },
            x2: { field: "end" },
            search: { field: "label" },
        },
    });
    const match = createDatumSearch(views).findDatums("TP53", { limit: 1 })
        .matches[0];
    expect(match.datum.label).toBe("TP53");
    expect(match.targets[0]).toMatchObject({
        kind: "numeric",
        interval: [5, 10],
    });
});

test("keeps facets and skips non-navigable matches before applying the bound", async () => {
    const { views } = await createTestEmbed({
        vconcat: [
            {
                name: "noPosition",
                data: { values: [{ symbol: "TP53" }] },
                mark: "point",
                encoding: { search: { field: "symbol" } },
            },
            {
                data: {
                    values: [
                        { group: "A", symbol: "TP53", pos: 10 },
                        { group: "B", symbol: "TP53", pos: 20 },
                    ],
                },
                facet: { field: "group" },
                spec: {
                    name: "faceted",
                    mark: "point",
                    encoding: {
                        x: {
                            field: "pos",
                            type: "locus",
                            scale: {
                                assembly: {
                                    contigs: [{ name: "scaffold", size: 100 }],
                                },
                                zoom: true,
                            },
                        },
                        search: { field: "symbol" },
                    },
                },
            },
        ],
    });
    const search = createDatumSearch(views);
    expect(search.findDatums("TP53", { limit: 1 }).matches[0].targets).toEqual(
        []
    );
    const result = search.findDatums("TP53", { limit: 1, target: "zoomable" });
    expect(result.matches[0].facetId).toEqual(["A"]);
    expect(result.matches[0].targets[0].interval).toEqual([10, 11]);
    expect(result.truncated).toBe(true);
});

test("metadata revisions refresh after replacement, insertion, removal, and finalization", async () => {
    const { views, finalize } = await createTestEmbed({
        datasets: { rows: [{ symbol: "TP53" }] },
        vconcat: [
            {
                name: "records",
                data: { name: "rows" },
                mark: "point",
                encoding: { search: { field: "symbol" } },
            },
        ],
    });
    const search = createDatumSearch(views);
    const initial = search.listSearchableViews({ exampleLimit: 1 })[0];
    expect(initial.fields[0].examples).toEqual(["TP53"]);
    views.root().datasets.set("rows", [{ symbol: "BRCA1" }]);
    const updated = search.listSearchableViews({ exampleLimit: 1 })[0];
    expect(updated.source.dataRevision).toBeGreaterThan(
        initial.source.dataRevision
    );
    expect(updated.fields[0].examples).toEqual(["BRCA1"]);
    expect(
        search.listSearchableViews({ exampleLimit: 0 })[0].source.rowsExamined
    ).toBe(0);
    const inserted = await views.insert("root", genes("inserted"));
    expect(
        search.findDatums("TP53", { view: inserted, limit: 10 }).matches
    ).toHaveLength(2);
    await views.remove(inserted);
    expect(() =>
        search.findDatums("TP53", { view: inserted, limit: 1 })
    ).toThrow();
    const foreign = await createTestEmbed(genes("foreign"));
    expect(() =>
        search.findDatums("TP53", { view: foreign.views.root(), limit: 1 })
    ).toThrow();
    finalize();
    expect(() => search.listSearchableViews()).toThrow(/finalized/);
});

test("reports uninitialized searchable views without loading their records", async () => {
    const { view } = await createHeadlessViewHierarchy(genes("pending"));
    onTestFinished(() => view.disposeSubtree());
    const search = createDatumSearch(createViewMutationApi({ viewRoot: view }));
    const result = search.findDatums("TP53", { limit: 10 });
    expect(result.matches).toEqual([]);
    expect(result.sources[0]).toMatchObject({
        readiness: "pending",
        rowsExamined: 0,
        scan: "unscanned",
    });
});

test("keeps matches with unsupported or missing positions without fabricating targets", async () => {
    const { views } = await createTestEmbed({
        data: { values: [{ symbol: "TP53", start: null, end: 10 }] },
        mark: "point",
        encoding: {
            x: { datum: 5, type: "quantitative" },
            y: { field: "end", type: "quantitative" },
            search: { field: "symbol" },
        },
    });
    const result = createDatumSearch(views).findDatums("TP53", { limit: 1 });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].targets).toEqual([]);
    expect(result.matches[0].targetIssues).toEqual(
        expect.arrayContaining([
            { channel: "x", reason: "unsupported-projection" },
        ])
    );
});
