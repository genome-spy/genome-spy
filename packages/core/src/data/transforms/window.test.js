import { describe, expect, test } from "vitest";
import Collector from "../collector.js";
import { processData } from "../flowTestUtils.js";
import { optimizeDataFlow } from "../flowOptimizer.js";
import { buildDataFlow } from "../../view/flowBuilder.js";
import { createTestViewContext } from "../../view/testUtils.js";
import WindowTransform from "./window.js";

/**
 * @param {import("../../spec/transform.js").WindowParams} params
 * @param {any[]} data
 */
function transform(params, data) {
    return processData(new WindowTransform(params), data);
}

describe("Window transform", () => {
    test("calculates every window-only operation using sorted peers", () => {
        const rows = transform(
            {
                type: "window",
                sort: { field: "value", order: "ascending" },
                ops: [
                    "row_number",
                    "rank",
                    "dense_rank",
                    "percent_rank",
                    "cume_dist",
                    "ntile",
                    "lag",
                    "lead",
                    "first_value",
                    "last_value",
                    "nth_value",
                    "prev_value",
                    "next_value",
                ],
                fields: [
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    "value",
                    "value",
                    "value",
                    "value",
                    "value",
                    "value",
                    "value",
                ],
                params: [
                    null,
                    null,
                    null,
                    null,
                    null,
                    3,
                    null,
                    null,
                    null,
                    null,
                    2,
                    null,
                    null,
                ],
                as: [
                    "rowNumber",
                    "rank",
                    "denseRank",
                    "percentRank",
                    "cumeDist",
                    "tile",
                    "lag",
                    "lead",
                    "first",
                    "last",
                    "nth",
                    "previous",
                    "next",
                ],
            },
            [
                { id: "two", value: 2 },
                { id: "one-a", value: 1 },
                { id: "four", value: 4 },
                { id: "one-b", value: 1 },
            ]
        );

        // Results use sort order, while propagated rows retain their input order.
        expect(rows.map((row) => row.id)).toEqual([
            "two",
            "one-a",
            "four",
            "one-b",
        ]);
        expect(rows).toEqual([
            {
                id: "two",
                value: 2,
                rowNumber: 3,
                rank: 3,
                denseRank: 2,
                percentRank: 2 / 3,
                cumeDist: 0.75,
                tile: 3,
                lag: 1,
                lead: 4,
                first: 1,
                last: 2,
                nth: 1,
                previous: 2,
                next: 2,
            },
            {
                id: "one-a",
                value: 1,
                rowNumber: 1,
                rank: 1,
                denseRank: 1,
                percentRank: 0,
                cumeDist: 0.5,
                tile: 2,
                lag: null,
                lead: 1,
                first: 1,
                last: 1,
                nth: 1,
                previous: 1,
                next: 1,
            },
            {
                id: "four",
                value: 4,
                rowNumber: 4,
                rank: 4,
                denseRank: 3,
                percentRank: 1,
                cumeDist: 1,
                tile: 3,
                lag: 2,
                lead: null,
                first: 1,
                last: 4,
                nth: 1,
                previous: 4,
                next: 4,
            },
            {
                id: "one-b",
                value: 1,
                rowNumber: 2,
                rank: 1,
                denseRank: 1,
                percentRank: 0,
                cumeDist: 0.5,
                tile: 2,
                lag: 1,
                lead: 2,
                first: 1,
                last: 1,
                nth: 1,
                previous: 1,
                next: 1,
            },
        ]);
    });

    test("expands frame boundaries to peers unless ignorePeers is set", () => {
        /** @type {import("../../spec/transform.js").WindowParams} */
        const params = {
            type: "window",
            sort: { field: "value" },
            ops: ["sum"],
            fields: ["value"],
            as: ["total"],
            frame: [0, 0],
        };

        expect(
            transform(params, [{ value: 1 }, { value: 1 }, { value: 2 }])
        ).toEqual([
            { value: 1, total: 2 },
            { value: 1, total: 2 },
            { value: 2, total: 2 },
        ]);

        expect(
            transform({ ...params, ignorePeers: true }, [
                { value: 1 },
                { value: 1 },
                { value: 2 },
            ])
        ).toEqual([
            { value: 1, total: 1 },
            { value: 1, total: 1 },
            { value: 2, total: 2 },
        ]);
    });

    test("calculates sliding aggregate operations with shared input fields", () => {
        const rows = transform(
            {
                type: "window",
                ops: [
                    "count",
                    "valid",
                    "sum",
                    "min",
                    "max",
                    "mean",
                    "q1",
                    "median",
                    "q3",
                    "variance",
                ],
                fields: [
                    null,
                    "value",
                    "value",
                    "value",
                    "value",
                    "value",
                    "value",
                    "value",
                    "value",
                    "value",
                ],
                as: [
                    "count",
                    "valid",
                    "sum",
                    "min",
                    "max",
                    "mean",
                    "q1",
                    "median",
                    "q3",
                    "variance",
                ],
                frame: [-1, 0],
            },
            [{ value: 1 }, { value: 2 }, { value: 3 }]
        );

        expect(rows[0]).toEqual({
            value: 1,
            count: 1,
            valid: 1,
            sum: 1,
            min: 1,
            max: 1,
            mean: 1,
            q1: 1,
            median: 1,
            q3: 1,
            variance: undefined,
        });
        expect(rows[1]).toEqual({
            value: 2,
            count: 2,
            valid: 2,
            sum: 3,
            min: 1,
            max: 2,
            mean: 1.5,
            q1: 1.25,
            median: 1.5,
            q3: 1.75,
            variance: 0.5,
        });
        expect(rows[2]).toEqual({
            value: 3,
            count: 2,
            valid: 2,
            sum: 5,
            min: 2,
            max: 3,
            mean: 2.5,
            q1: 2.25,
            median: 2.5,
            q3: 2.75,
            variance: 0.5,
        });
    });

    test("ignores missing and NaN values in field aggregates", () => {
        expect(
            transform(
                {
                    type: "window",
                    ops: ["count", "valid", "sum", "mean", "variance"],
                    fields: [null, "value", "value", "value", "value"],
                    as: ["count", "valid", "sum", "mean", "variance"],
                },
                [
                    { value: 1 },
                    { value: null },
                    { value: "" },
                    { value: NaN },
                    { value: 3 },
                ]
            ).at(-1)
        ).toEqual({
            value: 3,
            count: 5,
            valid: 2,
            sum: 4,
            mean: 2,
            variance: 2,
        });
    });

    test("partitions by composite keys without coercing key types", () => {
        expect(
            transform(
                {
                    type: "window",
                    groupby: ["sample", "chrom"],
                    sort: { field: "position" },
                    ops: ["lead"],
                    fields: ["value"],
                    as: ["next"],
                },
                [
                    { sample: 1, chrom: "1", position: 2, value: "b" },
                    { sample: "1", chrom: "1", position: 1, value: "c" },
                    { sample: 1, chrom: "1", position: 1, value: "a" },
                    { sample: 1, chrom: "2", position: 1, value: "d" },
                ]
            )
        ).toEqual([
            { sample: 1, chrom: "1", position: 2, value: "b", next: null },
            { sample: "1", chrom: "1", position: 1, value: "c", next: null },
            { sample: 1, chrom: "1", position: 1, value: "a", next: "b" },
            { sample: 1, chrom: "2", position: 1, value: "d", next: null },
        ]);
    });

    test("uses defaults, permits overwrites, and validates invalid configuration", () => {
        expect(
            transform(
                {
                    type: "window",
                    ops: ["lead"],
                    fields: ["value"],
                    as: ["value"],
                },
                [{ value: 1 }, { value: 2 }]
            )
        ).toEqual([{ value: 2 }, { value: null }]);

        expect(
            transform({ type: "window", ops: ["row_number"] }, [{}])
        ).toEqual([{ row_number: 1 }]);

        expect(
            () => new WindowTransform({ type: "window", ops: ["lead"] })
        ).toThrow(/requires a field/);
        expect(
            () =>
                new WindowTransform({
                    type: "window",
                    ops: ["ntile"],
                    params: [0],
                })
        ).toThrow(/positive integer/);
        expect(
            () =>
                new WindowTransform({
                    type: "window",
                    ops: ["row_number"],
                    fields: [null, null],
                })
        ).toThrow(/one entry/);
    });

    test("flushes every batch independently", () => {
        const window = new WindowTransform({
            type: "window",
            ops: ["lead"],
            fields: ["value"],
            as: ["next"],
        });
        const collector = new Collector();
        window.addChild(collector);

        window.beginBatch({ type: "facet", facetId: ["A"] });
        window.handle({ value: 1 });
        window.handle({ value: 2 });

        window.beginBatch({ type: "facet", facetId: ["B"] });
        window.handle({ value: 3 });
        window.complete();

        expect(collector.facetBatches.get(["A"])).toEqual([
            { value: 1, next: 2 },
            { value: 2, next: null },
        ]);
        expect(collector.facetBatches.get(["B"])).toEqual([
            { value: 3, next: null },
        ]);
    });

    test("clears buffered rows on reset", () => {
        const window = new WindowTransform({
            type: "window",
            ops: ["lead"],
            fields: ["value"],
        });
        const collector = new Collector();
        window.addChild(collector);

        window.handle({ value: 1 });
        window.reset();
        window.handle({ value: 2 });
        window.complete();

        expect([...collector.getData()]).toEqual([
            { value: 2, lead_value: null },
        ]);
    });

    test("keeps sibling branches and upstream collectors immutable", async () => {
        const context = createTestViewContext();
        /** @type {import("../../spec/view.js").LayerSpec} */
        const spec = {
            data: { values: [{ value: 1 }, { value: 2 }] },
            layer: [
                {
                    transform: [
                        {
                            type: "window",
                            ops: ["lead"],
                            fields: ["value"],
                            as: ["next"],
                        },
                    ],
                    mark: "point",
                    encoding: {
                        x: { field: "value", type: "quantitative" },
                    },
                },
                {
                    mark: "point",
                    encoding: {
                        x: { field: "value", type: "quantitative" },
                    },
                },
            ],
        };
        const root = await context.createOrImportView(spec, null, null, "root");
        const flow = buildDataFlow(root, context.dataFlow);
        optimizeDataFlow(flow);

        await flow.dataSources[0].load();

        const [windowView, siblingView] = /** @type {any} */ (root).children;
        expect(
            [...windowView.flowHandle.collector.getData()].map(
                ({ value, next }) => ({ value, next })
            )
        ).toEqual([
            { value: 1, next: 2 },
            { value: 2, next: null },
        ]);
        expect(
            [...siblingView.flowHandle.collector.getData()].map(
                ({ value }) => ({
                    value,
                })
            )
        ).toEqual([{ value: 1 }, { value: 2 }]);
    });
});
