import { describe, expect, onTestFinished, test, vi } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { processData } from "../flowTestUtils.js";
import Collector from "../collector.js";
import FlowNode from "../flowNode.js";
import AggregateTransform from "./aggregate.js";

/**
 * @param {import("../../spec/transform.js").AggregateParams} params
 * @param {any[]} data
 */
function transform(params, data) {
    return processData(new AggregateTransform(params), data);
}

class ContiguousKeySource extends FlowNode {
    get outputGrouping() {
        return { keys: [["key"]], fileFree: false };
    }
}

describe("Aggregate transform", () => {
    test("Default to count when no data fields or group-by fields are specified", () => {
        const input = [
            { name: "alpha", data: 123 },
            { name: "beta", data: 456 },
            { name: "beta", data: 789 },
        ];

        expect(transform({ type: "aggregate" }, input)).toEqual([{ count: 3 }]);
    });

    test("empty input has a zero-count summary without creating empty groups", () => {
        expect(transform({ type: "aggregate" }, [])).toEqual([{ count: 0 }]);
        expect(
            transform({ type: "aggregate", groupby: ["sample"] }, [])
        ).toEqual([]);
    });

    test("physical files share one global reduction, including empty replacements", () => {
        const aggregate = new AggregateTransform({ type: "aggregate" });
        const collector = new Collector();
        aggregate.addChild(collector);

        aggregate.beginBatch({ type: "file", url: "first.json" });
        aggregate.handle({ value: 1 });
        aggregate.beginBatch({ type: "file", url: "second.json" });
        aggregate.handle({ value: 2 });
        aggregate.handle({ value: 3 });
        aggregate.beginBatch({ type: "file", url: "empty.json" });
        aggregate.complete();
        expect(Array.from(collector.getData())).toEqual([{ count: 3 }]);

        aggregate.reset();
        aggregate.beginBatch({ type: "file", url: "empty.json" });
        aggregate.complete();
        expect(Array.from(collector.getData())).toEqual([{ count: 0 }]);
    });

    test("Default to count when no data fields fields are specified", () => {
        const input = [
            { name: "alpha", data: 123 },
            { name: "beta", data: 456 },
            { name: "beta", data: 789 },
        ];

        expect(
            transform({ type: "aggregate", groupby: ["name"] }, input)
        ).toEqual([
            { name: "alpha", count: 1 },
            { name: "beta", count: 2 },
        ]);
    });

    test("compound groups retain first-seen order and intern object keys", () => {
        const date = new Date(2);
        const output = transform(
            { type: "aggregate", groupby: ["sample", "key"] },
            [
                { sample: "x", key: 1 },
                { sample: "y", key: date },
                { sample: "x", key: new Date(1) },
                { sample: "x", key: NaN },
                { sample: "y", key: 2 },
                { sample: "x", key: NaN },
            ]
        );

        expect(output).toEqual([
            { sample: "x", key: 1, count: 2 },
            { sample: "x", key: NaN, count: 2 },
            { sample: "y", key: date, count: 2 },
        ]);
        expect(output[2].key).toBe(date);
    });

    test("Compute count, sum, min, max, and mean for groups. Use default output field names.", () => {
        const input = [
            { name: "alpha", data: 123 },
            { name: "beta", data: 456 },
            { name: "beta", data: 789 },
        ];

        expect(
            transform(
                {
                    type: "aggregate",
                    groupby: ["name"],
                    fields: ["data", "data", "data", "data", "data"],
                    ops: ["count", "sum", "min", "max", "mean"],
                },
                input
            )
        ).toEqual([
            {
                name: "alpha",
                count_data: 1,
                sum_data: 123,
                min_data: 123,
                max_data: 123,
                mean_data: 123,
            },
            {
                name: "beta",
                count_data: 2,
                sum_data: 1245,
                min_data: 456,
                max_data: 789,
                mean_data: 622.5,
            },
        ]);
    });

    test("Allow custom output field names", () => {
        const input = [
            { name: "alpha", data: 123 },
            { name: "beta", data: 456 },
            { name: "beta", data: 789 },
        ];

        expect(
            transform(
                {
                    type: "aggregate",
                    fields: ["data", "data", "data", "data", "data"],
                    ops: ["count", "sum", "min", "max", "mean"],
                    as: ["count", "total", "min", "max", "average"],
                },
                input
            )
        ).toEqual([
            {
                count: 3,
                total: 1368,
                min: 123,
                max: 789,
                average: 456,
            },
        ]);
    });

    test("Compute quartiles with Vega-compatible q1 and q3 ops", () => {
        const input = [
            { name: "alpha", data: 1 },
            { name: "alpha", data: 2 },
            { name: "alpha", data: 3 },
            { name: "alpha", data: 4 },
            { name: "alpha", data: 5 },
            { name: "beta", data: 10 },
            { name: "beta", data: 20 },
            { name: "beta", data: 30 },
            { name: "beta", data: 40 },
            { name: "beta", data: 50 },
        ];

        expect(
            transform(
                {
                    type: "aggregate",
                    groupby: ["name"],
                    fields: ["data", "data", "data"],
                    ops: ["q1", "median", "q3"],
                    as: ["q1", "median", "q3"],
                },
                input
            )
        ).toEqual([
            { name: "alpha", q1: 2, median: 3, q3: 4 },
            { name: "beta", q1: 20, median: 30, q3: 40 },
        ]);
    });

    test("Throw if the length of fields and ops does not match", () => {
        const input = [{ name: "beta", data: 789 }];

        expect(() =>
            transform(
                {
                    type: "aggregate",
                    fields: ["data", "data", "data", "data"],
                    ops: ["count", "sum", "min", "max", "mean"],
                },
                input
            )
        ).toThrow();
    });

    test("Throw if the length of fields and as does not match", () => {
        const input = [{ name: "beta", data: 789 }];

        expect(() =>
            transform(
                {
                    type: "aggregate",
                    fields: ["data"],
                    ops: ["count"],
                    as: ["count", "total"],
                },
                input
            )
        ).toThrow();
    });

    test("groupby subdivides each facet independently", () => {
        const aggregate = new AggregateTransform({
            type: "aggregate",
            groupby: ["sample"],
            fields: ["value"],
            ops: ["sum"],
            as: ["total"],
        });
        const collector = new Collector();
        aggregate.addChild(collector);

        // BeginBatch is what closes the previous facet in faceted flows.
        aggregate.beginBatch({ type: "facet", facetId: ["A"] });
        aggregate.beginBatch({ type: "file", url: "first.json" });
        aggregate.handle({ sample: "x", value: 1 });
        aggregate.handle({ sample: "y", value: 2 });
        aggregate.beginBatch({ type: "file", url: "second.json" });
        aggregate.handle({ sample: "x", value: 3 });

        aggregate.beginBatch({ type: "facet", facetId: ["empty"] });
        aggregate.beginBatch({ type: "facet", facetId: ["B"] });
        aggregate.handle({ sample: "x", value: 4 });
        aggregate.handle({ sample: "y", value: 5 });

        aggregate.complete();

        expect(collector.facetBatches.get(["A"])).toEqual([
            { sample: "x", total: 4 },
            { sample: "y", total: 2 },
        ]);
        expect(collector.facetBatches.get(["B"])).toEqual([
            { sample: "x", total: 4 },
            { sample: "y", total: 5 },
        ]);
        expect(collector.facetBatches.get(["empty"])).toEqual([]);
    });

    test.each([
        {
            withChrom: false,
            key: "spanStart",
            groups: [
                [0, 2],
                [2, 1],
                [4, 1],
                [6, 1],
                [8, 1],
            ],
        },
        {
            withChrom: true,
            key: "contig",
            groups: [
                ["chr1", 3],
                ["chr2", 3],
            ],
        },
    ])(
        "streams categorical coverage groups by $key",
        async ({ withChrom, key, groups }) => {
            let rowsBeforeCoverageCompleted = 0;
            const { view } = await createHeadlessEngine(
                {
                    data: {
                        values: [
                            { chrom: "chr1", start: 0, end: 2, category: "A" },
                            { chrom: "chr1", start: 0, end: 2, category: "B" },
                            { chrom: "chr1", start: 2, end: 4, category: "B" },
                            { chrom: "chr2", start: 4, end: 6, category: "A" },
                            { chrom: "chr2", start: 6, end: 8, category: "B" },
                            { chrom: "chr2", start: 8, end: 10, category: "A" },
                        ],
                    },
                    transform: [
                        {
                            type: "categoricalCoverage",
                            start: "start",
                            end: "end",
                            category: "category",
                            ...(withChrom
                                ? { chrom: "chrom", asChrom: "contig" }
                                : { asStart: "spanStart" }),
                        },
                        { type: "aggregate", groupby: [key] },
                    ],
                    mark: { type: "point", tooltip: null },
                },
                {
                    onDataFlowBuilt(dataFlow) {
                        const output = dataFlow.collectors.find(
                            (collector) =>
                                collector.parent?.label === "aggregate"
                        );
                        const coverage = output.parent.parent;
                        const complete = coverage.complete.bind(coverage);
                        const probe = vi
                            .spyOn(coverage, "complete")
                            .mockImplementation(() => {
                                rowsBeforeCoverageCompleted =
                                    output.facetBatches.get(undefined).length;
                                complete();
                            });
                        onTestFinished(() => probe.mockRestore());
                    },
                }
            );
            onTestFinished(() => view.disposeSubtree());

            expect(rowsBeforeCoverageCompleted).toBeGreaterThan(0);
            expect(
                Array.from(view.flowHandle.collector.getData(), (row) => [
                    row[key],
                    row.count,
                ])
            ).toEqual(groups);
        }
    );

    test("contiguous median groups merge signed zero across files and isolate facets", () => {
        const source = new ContiguousKeySource();
        const aggregate = new AggregateTransform({
            type: "aggregate",
            groupby: ["key"],
            fields: ["value"],
            ops: ["median"],
            as: ["median"],
        });
        const output = new Collector();
        source.addChild(aggregate);
        aggregate.addChild(output);

        source.beginBatch({ type: "facet", facetId: ["empty"] });
        source.beginBatch({ type: "facet", facetId: ["A"] });
        source.beginBatch({ type: "file", url: "first.json" });
        source.handle({ key: -0, value: 5 });
        source.beginBatch({ type: "file", url: "second.json" });
        source.handle({ key: 0, value: 1 });
        source.handle({ key: 0, value: 3 });
        source.handle({ key: 2, value: 9 });
        const firstGroup = { key: 0, median: 3 };
        expect(output.facetBatches.get(["A"])).toStrictEqual([firstGroup]);

        source.beginBatch({ type: "facet", facetId: ["B"] });
        source.handle({ key: 2, value: 10 });
        source.complete();

        expect(output.facetBatches.get(["empty"])).toEqual([]);
        expect(output.facetBatches.get(["A"])).toEqual([
            firstGroup,
            { key: 2, median: 9 },
        ]);
        expect(output.facetBatches.get(["B"])).toEqual([
            { key: 2, median: 10 },
        ]);
    });

    test("completing after a downstream row error does not repeat an emitted group", () => {
        const source = new ContiguousKeySource();
        const aggregate = new AggregateTransform({
            type: "aggregate",
            groupby: ["key"],
        });
        const output = new Collector();
        const failingChild = new FlowNode();
        vi.spyOn(failingChild, "handle").mockImplementationOnce(() => {
            throw new Error("Downstream row error");
        });
        source.addChild(aggregate);
        aggregate.addChild(output).addChild(failingChild);

        source.handle({ key: 1 });
        expect(() => source.handle({ key: 2 })).toThrow("Downstream row error");
        source.complete();

        expect(Array.from(output.getData())).toEqual([{ key: 1, count: 1 }]);
    });
});
