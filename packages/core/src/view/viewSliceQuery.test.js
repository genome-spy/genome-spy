import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { createViewMutationApi } from "./viewMutationApi.js";
import { createViewQuery } from "../viewQuery.js";
import { processData } from "../data/flowTestUtils.js";
import AggregateTransform from "../data/transforms/aggregate.js";

/** @param {any[]} rows @param {Record<string, any>} [spec] */
async function setup(rows, spec = {}) {
    const { view } = await createHeadlessEngine({
        name: "track",
        data: { values: rows },
        mark: "point",
        encoding: {
            x: {
                field: "x",
                type: "quantitative",
                scale: { domain: [0, 5000], zoom: true, nice: false },
            },
        },
        ...spec,
    });
    const api = createViewMutationApi({ viewRoot: view });
    return { view, handle: api.get("root"), query: createViewQuery(api) };
}

const options = /** @type {const} */ ({ channels: ["x"], limit: 2 });
/** @type {import("../types/viewQueryApi.js").ViewSliceQueryOptions} */
const request = { channels: [...options.channels], limit: options.limit };

describe("scoped loaded-data queries", () => {
    test("filters before limiting, aggregates all matches and records scope", async () => {
        const rows = Array.from({ length: 3000 }, (_, x) => ({
            x,
            value: x * 2,
            nested: { x },
        }));
        const { query, handle } = await setup(rows);
        await handle.getScaleResolution("x").zoomTo([2000, 2200]);
        const result = await query.queryData(handle, {
            ...request,
            fields: ["x", "nested"],
            aggregate: [
                { op: "mean", field: "value", as: "average" },
                { op: "count", as: "count" },
            ],
        });
        expect(result).toMatchObject({
            rows: [{ x: 2000 }, { x: 2001 }],
            rowsExamined: 3000,
            rowsMatched: 200,
            truncated: true,
            aggregates: { average: 4199, count: 200 },
            scope: {
                domains: { x: [2000, 2200] },
                data: "loaded-transformed",
                sourceCoverage: "unknown",
            },
        });
        expect(result.scope.dataRevision).toBe(
            query.describe(handle).dataRevision
        );
        /** @type {{x: number}} */ (result.rows[0].nested).x = 7;
        expect((await query.queryData(handle, request)).rows[0].nested).toEqual(
            { x: 2000 }
        );
    });

    test("uses ranged mark overlap, handles reversed endpoints and half-open boundaries", async () => {
        const { query, handle } = await setup(
            [
                { x: 0, end: 10 },
                { x: 5, end: 15 },
                { x: 25, end: 15 },
                { x: 20, end: 30 },
            ],
            {
                mark: "rule",
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { domain: [10, 20], nice: false },
                    },
                    x2: { field: "end" },
                },
            }
        );
        expect(
            (await query.queryData(handle, { ...request, limit: 10 })).rows
        ).toEqual([
            { x: 5, end: 15 },
            { x: 25, end: 15 },
        ]);
    });

    test("horizontal rules include the lower scalar-axis boundary", async () => {
        const { query, handle } = await setup(
            [
                { x: 1, end: 3, y: 0 },
                { x: 1, end: 3, y: 6 },
            ],
            {
                mark: "rule",
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { domain: [0, 5], nice: false },
                    },
                    x2: { field: "end" },
                    y: {
                        field: "y",
                        type: "quantitative",
                        scale: { domain: [0, 6], nice: false },
                    },
                },
            }
        );
        expect(
            (await query.queryData(handle, { channels: ["x", "y"], limit: 10 }))
                .rows
        ).toEqual([{ x: 1, end: 3, y: 0 }]);
    });

    test("matches aggregate transform semantics without cloning source payloads", async () => {
        // Uncloneable payloads prove an aggregate-only query doesn't copy input rows.
        const rows = [
            { x: 1, value: 2 },
            { x: 2, value: null },
            { x: 3, value: 4 },
            { x: 4, value: NaN },
        ];
        const { query, handle, view } = await setup(rows);
        for (const row of /** @type {any} */ (view).getCollector().getData())
            row.payload = () => {};
        const ops = /** @type {const} */ ([
            "count",
            "valid",
            "min",
            "max",
            "sum",
            "mean",
            "variance",
        ]);
        const result = await query.queryData(handle, {
            ...request,
            limit: 0,
            aggregate: ops.map((op) => ({ op, field: "value", as: op })),
        });
        const expected = processData(
            new AggregateTransform({
                type: "aggregate",
                ops: [...ops],
                fields: ops.map(() => "value"),
                as: [...ops],
            }),
            rows
        )[0];
        expect(result.aggregates).toEqual(expected);
        expect(result.rows).toEqual([]);
        expect(result.rowsMatched).toBe(4);
    });

    test("detaches nonnumeric extrema and rejects shared memory in aggregate-only results", async () => {
        const { query, handle, view } = await setup([
            { x: 1, value: { nested: [7] } },
        ]);
        const aggregateRequest = {
            ...request,
            limit: 0,
            aggregate: [
                {
                    op: /** @type {const} */ ("min"),
                    field: "value",
                    as: "minimum",
                },
            ],
        };
        const result = await query.queryData(handle, aggregateRequest);
        expect(result.aggregates.minimum).toEqual({ nested: [7] });
        /** @type {{nested:number[]}} */ (result.aggregates.minimum).nested[0] =
            99;
        expect(
            (await query.queryData(handle, aggregateRequest)).aggregates.minimum
        ).toEqual({ nested: [7] });

        if (typeof SharedArrayBuffer !== "undefined") {
            /** @type {any} */ (view)
                .getCollector()
                .getData()
                [Symbol.iterator]()
                .next().value.value = { payload: new SharedArrayBuffer(8) };
            await expect(
                query.queryData(handle, aggregateRequest)
            ).rejects.toThrow("Shared memory");
        }
    });

    test("empty slices return exact zero counts and null missing statistics", async () => {
        const { query, handle } = await setup([{ x: 1 }]);
        await handle.getScaleResolution("x").zoomTo([10, 20]);
        expect(
            await query.queryData(handle, {
                ...request,
                aggregate: [
                    { op: "count", as: "count" },
                    { op: "mean", field: "x", as: "mean" },
                ],
            })
        ).toMatchObject({
            rows: [],
            rowsMatched: 0,
            truncated: false,
            aggregates: { count: 0, mean: null },
        });
    });

    test("intersects named interval selections and viewport; cleared selection is empty", async () => {
        const { query, handle } = await setup(
            [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }],
            {
                params: [
                    {
                        name: "region",
                        select: { type: "interval", encodings: ["x"] },
                    },
                ],
            }
        );
        handle.params
            .get("region")
            .setValue({ type: "interval", intervals: { x: [2, 4] } });
        await handle.getScaleResolution("x").zoomTo([1, 3]);
        const result = await query.queryData(handle, {
            ...request,
            selection: "region",
        });
        expect(result.rows).toEqual([{ x: 2 }]);
        expect(result.scope.selection).toMatchObject({
            name: "region",
            value: { intervals: { x: [2, 4] } },
        });
        // Headless views have no gesture controller; write the public cleared value.
        handle.params
            .get("region")
            .setValue({ type: "interval", intervals: { x: null } });
        expect(
            (await query.queryData(handle, { ...request, selection: "region" }))
                .rowsMatched
        ).toBe(0);
    });

    test("inactive dimensions of an interval selection do not constrain active dimensions", async () => {
        const { query, handle } = await setup(
            [
                { x: 1, y: 2 },
                { x: 3, y: 4 },
            ],
            {
                params: [
                    {
                        name: "region",
                        select: { type: "interval", encodings: ["x", "y"] },
                    },
                ],
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { domain: [0, 5], nice: false },
                    },
                    y: {
                        field: "y",
                        type: "quantitative",
                        scale: { domain: [0, 5], nice: false },
                    },
                },
            }
        );
        handle.params
            .get("region")
            .setValue({ type: "interval", intervals: { x: [2, 4], y: null } });
        expect(
            (await query.queryData(handle, { ...request, selection: "region" }))
                .rows
        ).toEqual([{ x: 3, y: 4 }]);
        handle.params
            .get("region")
            .setValue({ type: "interval", intervals: { x: null, y: null } });
        expect(
            (await query.queryData(handle, { ...request, selection: "region" }))
                .rowsMatched
        ).toBe(0);
    });

    test("y viewport filters independently of x on numeric plots", async () => {
        const { query, handle } = await setup(
            [
                { x: 1, y: 0 },
                { x: 2, y: 5 },
                { x: 3, y: 10 },
            ],
            {
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { domain: [0, 5], nice: false },
                    },
                    y: {
                        field: "y",
                        type: "quantitative",
                        scale: { domain: [3, 7], nice: false },
                    },
                },
            }
        );
        expect(
            (await query.queryData(handle, { channels: ["x", "y"], limit: 10 }))
                .rows
        ).toEqual([{ x: 2, y: 5 }]);
    });

    test.each(["abort", "domain", "data", "selection"])(
        "rejects %s changes during a cooperative scan",
        async (change) => {
            const { query, handle, view } = await setup(
                Array.from({ length: 3000 }, (_, x) => ({ x })),
                {
                    params: [
                        {
                            name: "region",
                            select: { type: "interval", encodings: ["x"] },
                        },
                    ],
                }
            );
            handle.params
                .get("region")
                .setValue({ type: "interval", intervals: { x: [0, 5000] } });
            const controller = new AbortController();
            const pending = query.queryData(handle, {
                ...request,
                selection: "region",
                signal: controller.signal,
            });
            if (change === "abort") controller.abort();
            else if (change === "domain")
                await handle.getScaleResolution("x").zoomTo([2, 3]);
            else if (change === "data")
                /** @type {any} */ (view).getCollector().reset();
            else
                handle.params
                    .get("region")
                    .setValue({ type: "interval", intervals: { x: [2, 3] } });
            await expect(pending).rejects.toThrow(
                change === "abort" ? /abort/i : /invalidated/
            );
        }
    );

    test("uses genomic conversion and offsets across chromosomes without row identities", async () => {
        const { query, handle } = await setup(
            [
                { chr: "chr1", start: 10, end: 20 },
                { chr: "chr2", start: 10, end: 20 },
            ],
            {
                assembly: "hg18",
                mark: "rule",
                encoding: {
                    x: {
                        chrom: "chr",
                        pos: "start",
                        type: "locus",
                        scale: { zoom: true },
                    },
                    x2: { chrom: "chr", pos: "end", offset: 1 },
                },
            }
        );
        const overview = await query.queryData(handle, {
            ...request,
            fields: ["chr"],
        });
        expect(overview.rows).toEqual([{ chr: "chr1" }, { chr: "chr2" }]);
        await handle.getScaleResolution("x").zoomTo([
            { chrom: "chr2", pos: 18 },
            { chrom: "chr2", pos: 18 },
        ]);
        expect(
            (await query.queryData(handle, { ...request, fields: ["chr"] }))
                .rows
        ).toEqual([{ chr: "chr2" }]);
        // Core's authored x2 offset is already applied: end 20 is displayed at 19.
        await handle.getScaleResolution("x").zoomTo([
            { chrom: "chr2", pos: 19 },
            { chrom: "chr2", pos: 20 },
        ]);
        expect((await query.queryData(handle, request)).rowsMatched).toBe(0);
    });

    test.each(["removed", "finalized"])(
        "rejects %s views during scanning",
        async (state) => {
            const { view } = await createHeadlessEngine({
                layer: [
                    {
                        name: "track",
                        mark: "point",
                        data: {
                            values: Array.from({ length: 3000 }, (_, x) => ({
                                x,
                            })),
                        },
                        encoding: { x: { field: "x", type: "quantitative" } },
                    },
                ],
            });
            let active = true;
            const api = createViewMutationApi({ viewRoot: view }, () => active);
            const handle = api.get({ view: "track", scope: [] });
            const query = createViewQuery(api);
            const pending = query.queryData(handle, request);
            if (state === "removed")
                await /** @type {import("./layerView.js").default} */ (
                    view
                ).removeChildAt(0);
            else active = false;
            await expect(pending).rejects.toMatchObject({
                code: state === "removed" ? "staleHandle" : "staleEmbed",
            });
        }
    );

    test("rejects unready, malformed and unsupported requests", async () => {
        const { query, handle, view } = await setup([{ x: 1 }]);
        for (const invalid of [
            {},
            { ...request, channels: [] },
            { ...request, limit: -1 },
            { ...request, aggregate: [{ op: "median", as: "m", field: "x" }] },
        ]) {
            await expect(
                query.queryData(handle, /** @type {any} */ (invalid))
            ).rejects.toThrow();
        }
        /** @type {any} */ (view).getCollector().reset();
        await expect(query.queryData(handle, request)).rejects.toThrow(
            "not ready"
        );
    });
});
