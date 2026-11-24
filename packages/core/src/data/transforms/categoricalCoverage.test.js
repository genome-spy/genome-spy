import { expect, test } from "vitest";
import Collector from "../collector.js";
import { processData } from "../flowTestUtils.js";
import CategoricalCoverageTransform from "./categoricalCoverage.js";

/** @type {import("../../spec/transform.js").CategoricalCoverageParams} */
const params = {
    type: "categoricalCoverage",
    chrom: "chrom",
    start: "start",
    end: "end",
    category: "state",
};

test("coalesces equal count vectors and leaves uncalled gaps", () => {
    /** @type {[number, number, string | null][]} */
    const segments = [
        [0, 4, "active"],
        [0, 4, "quiescent"],
        // Both states end and restart at the same coordinate.
        [4, 6, "quiescent"],
        [4, 6, "active"],
        [6, 8, "active"],
        [6, 8, "active"],
        [8, 9, null],
        [9, 10, "active"],
    ];
    const rows = segments.map(([start, end, state]) => ({
        chrom: "chr1",
        start,
        end,
        state,
    }));
    expect(processData(new CategoricalCoverageTransform(params), rows)).toEqual(
        [
            {
                chrom: "chr1",
                start: 0,
                end: 6,
                category: "active",
                count: 1,
                total: 2,
            },
            {
                chrom: "chr1",
                start: 0,
                end: 6,
                category: "quiescent",
                count: 1,
                total: 2,
            },
            {
                chrom: "chr1",
                start: 6,
                end: 8,
                category: "active",
                count: 2,
                total: 2,
            },
            {
                chrom: "chr1",
                start: 9,
                end: 10,
                category: "active",
                count: 1,
                total: 1,
            },
        ]
    );
});

test("flushes chromosome and facet boundaries while retaining calls across files", () => {
    const coverage = new CategoricalCoverageTransform(params);
    const collector = new Collector();
    coverage.addChild(collector);

    coverage.beginBatch({ type: "facet", facetId: ["A"] });
    coverage.handle({ chrom: "chr1", start: 0, end: 2, state: "active" });
    coverage.beginBatch({ type: "file", url: "second.tsv" });
    coverage.handle({ chrom: "chr1", start: 1, end: 2, state: "active" });
    coverage.handle({ chrom: "chr2", start: 0, end: 1, state: "active" });
    coverage.beginBatch({ type: "facet", facetId: ["B"] });
    coverage.handle({ chrom: "chr1", start: 0, end: 2, state: "quiescent" });
    coverage.complete();

    expect(collector.facetBatches.get(["A"])).toEqual([
        {
            chrom: "chr1",
            start: 0,
            end: 1,
            category: "active",
            count: 1,
            total: 1,
        },
        {
            chrom: "chr1",
            start: 1,
            end: 2,
            category: "active",
            count: 2,
            total: 2,
        },
        {
            chrom: "chr2",
            start: 0,
            end: 1,
            category: "active",
            count: 1,
            total: 1,
        },
    ]);
    expect(collector.facetBatches.get(["B"])).toEqual([
        {
            chrom: "chr1",
            start: 0,
            end: 2,
            category: "quiescent",
            count: 1,
            total: 1,
        },
    ]);

    coverage.reset();
    coverage.handle({ chrom: "chr1", start: 0, end: 1, state: "active" });
    coverage.complete();
    expect(Array.from(collector.getData())).toEqual([
        {
            chrom: "chr1",
            start: 0,
            end: 1,
            category: "active",
            count: 1,
            total: 1,
        },
    ]);
});

test("agrees with per-base counts for overlapping subsets of intervals", () => {
    const categories = [0, false, "quiescent"];
    const candidates = [
        { from: 0, to: 2, call: 0 },
        { from: 0, to: 4, call: false },
        { from: 1, to: 4, call: null },
        { from: 1, to: 3, call: "quiescent" },
        { from: 2, to: 4, call: 0 },
        { from: 3, to: 6, call: "quiescent" },
        { from: 4, to: 5, call: false },
    ].map((row) => ({ ...row, contig: "chr1" }));
    const coverage = new CategoricalCoverageTransform({
        ...params,
        chrom: "contig",
        start: "from",
        end: "to",
        category: "call",
    });

    for (let mask = 0; mask < 1 << candidates.length; mask++) {
        const rows = candidates.filter((_, i) => mask & (1 << i));
        coverage.reset();
        const spans = processData(coverage, rows);

        const expected = Array.from({ length: 6 }, (_, pos) => {
            const active = rows.filter(
                (row) => row.from <= pos && pos < row.to && row.call !== null
            );
            return categories.flatMap((category) => {
                const count = active.filter(
                    (row) => row.call === category
                ).length;
                return count ? [{ category, count, total: active.length }] : [];
            });
        });
        const actual = Array.from({ length: 6 }, (_, pos) =>
            spans
                .filter((span) => span.from <= pos && pos < span.to)
                .sort(
                    (a, b) =>
                        categories.indexOf(a.category) -
                        categories.indexOf(b.category)
                )
                .map(({ category, count, total }) => ({
                    category,
                    count,
                    total,
                }))
        );
        expect(actual).toEqual(expected);
    }
});

test("accepts linear intervals without a chromosome field", () => {
    const transform = new CategoricalCoverageTransform({
        type: "categoricalCoverage",
        start: "from",
        end: "to",
        category: "state",
    });
    expect(
        processData(transform, [{ from: 2, to: 5, state: "active" }])
    ).toEqual([{ from: 2, to: 5, category: "active", count: 1, total: 1 }]);
});

test("uses the configured coordinate and category output names", () => {
    const transform = new CategoricalCoverageTransform({
        ...params,
        asChrom: "contig",
        asStart: "from",
        asEnd: "to",
        as: ["label", "observed", "called"],
    });
    const rows = [{ chrom: "chr1", start: 2, end: 5, state: "active" }];
    expect(processData(transform, rows)).toEqual([
        {
            contig: "chr1",
            from: 2,
            to: 5,
            label: "active",
            observed: 1,
            called: 1,
        },
    ]);
});

test.each([
    { as: ["label", "count"], error: "as requires three output names" },
    { as: ["label", "count", "count"] },
    { as: ["label", "count", ""] },
    { as: ["label", "count", "__uniqueId"] },
    { asStart: "count", as: ["label", "count", "total"] },
])("rejects invalid output names $as", ({ as, asStart, error }) => {
    expect(
        () =>
            new CategoricalCoverageTransform({
                ...params,
                asStart,
                as: /** @type {any} */ (as),
            })
    ).toThrow(error ?? "output field names must be distinct and nonempty");
});

test.each([
    { updates: [{ start: 4, end: 4 }], error: "valid half-open intervals" },
    { updates: [{ end: Infinity }], error: "valid half-open intervals" },
    { updates: [{ chrom: null }], error: "valid half-open intervals" },
    { updates: [{ state: {} }], error: "category must be" },
    { updates: [{ state: NaN }], error: "category must be" },
    { updates: [{ start: 2 }, { start: 1 }], error: "start-sorted" },
    {
        updates: [{ chrom: "chr1" }, { chrom: "chr2" }, { chrom: "chr1" }],
        error: "contiguous chromosomes",
    },
])("rejects invalid input requiring $error", ({ updates, error }) => {
    const rows = updates.map((row) => ({
        chrom: "chr1",
        start: 0,
        end: 3,
        state: "active",
        ...row,
    }));
    expect(() =>
        processData(new CategoricalCoverageTransform(params), rows)
    ).toThrow(error);
});
