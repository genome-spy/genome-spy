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

    test("cancellation between aggregate passes prevents later work", async () => {
        const { query, handle, view } = await setup([
            { x: 1, first: 2, second: 3 },
        ]);
        const [row] = /** @type {any} */ (
            Array.from(/** @type {any} */ (view).getCollector().getData())
        );
        const controller = new AbortController();
        let secondRead = false;
        Object.defineProperties(row, {
            first: {
                get() {
                    setTimeout(() => controller.abort(), 0);
                    return 2;
                },
            },
            second: {
                get() {
                    secondRead = true;
                    return 3;
                },
            },
        });

        await expect(
            query.queryData(handle, {
                ...request,
                limit: 0,
                aggregate: [
                    { op: "mean", field: "first", as: "first" },
                    { op: "mean", field: "second", as: "second" },
                ],
                signal: controller.signal,
            })
        ).rejects.toMatchObject({ name: "AbortError" });
        expect(secondRead).toBe(false);
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

    test.each([false, true])(
        "selection boundaries match Core membership (ranged: %s)",
        async (ranged) => {
            const rows = [
                { x: 0, end: 1 },
                { x: 1, end: 2 },
                { x: 2, end: 3 },
                { x: 3, end: 4 },
            ];
            const { query, handle } = await setup(rows, {
                mark: ranged ? "rule" : "point",
                params: [
                    {
                        name: "region",
                        select: { type: "interval", encodings: ["x"] },
                    },
                ],
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { domain: [-1, 5], nice: false },
                    },
                    ...(ranged ? { x2: { field: "end" } } : {}),
                },
            });
            const selection =
                /** @type {import("../types/selectionTypes.js").IntervalSelection} */ ({
                    type: "interval",
                    intervals: { x: [1, 2] },
                });
            handle.params.get("region").setValue(selection);
            const result = await query.queryData(handle, {
                ...request,
                selection: "region",
                limit: 10,
            });
            expect(result.rows).toEqual([{ x: 1, end: 2 }]);
        }
    );

    test("scalar rule selection includes its lower boundary", async () => {
        const { query, handle } = await setup(
            [
                { x: 1, end: 3, y: 2 },
                { x: 1, end: 3, y: 4 },
            ],
            {
                mark: "rule",
                params: [
                    {
                        name: "region",
                        select: { type: "interval", encodings: ["y"] },
                    },
                ],
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { domain: [0, 5] },
                    },
                    x2: { field: "end" },
                    y: {
                        field: "y",
                        type: "quantitative",
                        scale: { domain: [0, 5] },
                    },
                    y2: { field: "y" },
                },
            }
        );
        handle.params
            .get("region")
            .setValue({ type: "interval", intervals: { y: [2, 4] } });
        const result = await query.queryData(handle, {
            ...request,
            selection: "region",
        });
        expect(result.rows).toEqual([{ x: 1, end: 3, y: 2 }]);
    });

    test("link slice membership matches the mark's conditional encoder", async () => {
        const rows = [
            { x: 0, end: 10 },
            { x: 4, end: 10 },
            { x: 0, end: 6 },
            { x: 10, end: 4 },
        ];
        const { query, handle, view } = await setup(rows, {
            mark: "link",
            params: [
                {
                    name: "region",
                    select: { type: "interval", encodings: ["x"] },
                },
            ],
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [-1, 11], nice: false },
                },
                x2: { field: "end" },
                opacity: {
                    value: 0,
                    condition: {
                        param: { or: ["region"] },
                        empty: false,
                        value: 1,
                    },
                },
            },
        });
        handle.params.get("region").setValue({
            type: "interval",
            intervals: { x: [4, 6] },
        });
        const mark = /** @type {import("./unitView.js").default} */ (view).mark;
        const selected = rows
            .filter((row) => mark.encoders.opacity(row) === 1)
            .map(({ x, end }) => ({ x, end }));
        expect(selected).toEqual([
            { x: 4, end: 10 },
            { x: 10, end: 4 },
        ]);
        expect(
            (
                await query.queryData(handle, {
                    ...request,
                    selection: "region",
                    limit: 10,
                })
            ).rows
        ).toEqual(selected);
    });

    test("ranged rows must independently match viewport and selection membership", async () => {
        const { query, handle } = await setup(
            [
                { x: 0, end: 10 },
                { x: 0, end: 1 },
                { x: 8, end: 10 },
            ],
            {
                mark: "rule",
                params: [
                    {
                        name: "region",
                        select: { type: "interval", encodings: ["x"] },
                    },
                ],
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { domain: [0, 2], nice: false },
                    },
                    x2: { field: "end" },
                },
            }
        );
        handle.params
            .get("region")
            .setValue({ type: "interval", intervals: { x: [8, 10] } });

        // A long mark can be visible and selected in different parts of its span.
        const result = await query.queryData(handle, {
            ...request,
            selection: "region",
        });
        expect(result.rows).toEqual([{ x: 0, end: 10 }]);
    });

    test.each(["x", "y"])(
        "selection-only categorical %s axes cannot bypass scale validation",
        async (channel) => {
            const viewport = channel === "x" ? "y" : "x";
            const { query, handle } = await setup(
                [
                    { x: 1, y: 1 },
                    { x: 2, y: 2 },
                ],
                {
                    params: [
                        {
                            name: "region",
                            select: { type: "interval", encodings: [channel] },
                        },
                    ],
                    encoding: {
                        [viewport]: {
                            field: viewport,
                            type: "quantitative",
                            scale: { domain: [0, 5], nice: false },
                        },
                        [channel]: {
                            field: channel,
                            type: "nominal",
                            scale: { domain: [1, 2] },
                        },
                    },
                }
            );
            handle.params.get("region").setValue({
                type: "interval",
                intervals: { [channel]: [1, 2] },
            });
            const scoped = {
                channels: [/** @type {"x" | "y"} */ (viewport)],
                selection: "region",
                limit: 10,
            };
            expect(query.assessQuery(handle, scoped)).toEqual({
                status: "unsupported",
                reason: "unsupported-scale",
            });
            await expect(query.queryData(handle, scoped)).rejects.toMatchObject(
                { reason: "unsupported-scale" }
            );
        }
    );

    test("partially cleared interval selections match no rows", async () => {
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
        ).toEqual([]);
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

    test.each([
        "__uniqueId",
        '["__uniqueId"]',
        "['__uniqueId']",
        "__unique\\Id",
        "__uniqueId.value",
        ".",
        "..",
    ])(
        "rejects private or identity field path %s in previews and aggregates",
        async (name) => {
            const { query, handle } = await setup([{ x: 1 }]);
            await expect(
                query.queryData(handle, {
                    ...request,
                    fields: [name],
                })
            ).rejects.toThrow("public field names");
            await expect(
                query.queryData(handle, {
                    ...request,
                    aggregate: [{ op: "sum", field: name, as: "total" }],
                })
            ).rejects.toThrow("public field names");
        }
    );

    test("preserves ordinary nested and escaped user field paths", async () => {
        const { query, handle } = await setup([
            { x: 1, nested: { __uniqueId: 7 }, "a.b": 3 },
        ]);
        const result = await query.queryData(handle, {
            ...request,
            fields: ["nested.__uniqueId", 'nested["__uniqueId"]', "a\\.b"],
            aggregate: [
                { op: "sum", field: 'nested["__uniqueId"]', as: "total" },
            ],
        });
        expect(result.rows).toEqual([
            {
                "nested.__uniqueId": 7,
                'nested["__uniqueId"]': 7,
                "a\\.b": 3,
            },
        ]);
        expect(result.aggregates).toEqual({ total: 7 });
    });

    test("rejects unready, malformed and unsupported requests", async () => {
        const { query, handle, view } = await setup([{ x: 1 }]);
        for (const invalid of [
            {},
            { ...request, channels: [] },
            { ...request, limit: -1 },
            ...[undefined, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1].map(
                (limit) => ({ ...request, limit })
            ),
            { ...request, fields: ["["] },
            { ...request, aggregate: [{ op: "sum", as: "sum", field: "[" }] },
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

describe("query assessment", () => {
    test("assesses without scanning and execution repeats the same checks", async () => {
        const { query, handle, view } = await setup([{ x: 1 }]);
        const collector = /** @type {any} */ (view).getCollector();
        const getData = collector.getData;
        collector.getData = () => {
            throw new Error("Unexpected scan");
        };
        expect(query.assessQuery(handle, request)).toEqual({ status: "ready" });
        collector.getData = getData;
        expect((await query.queryData(handle, request)).rowsMatched).toBe(1);
        collector.reset();
        expect(query.assessQuery(handle, request)).toEqual({
            status: "pending",
            reason: "data-not-ready",
        });
        await expect(query.queryData(handle, request)).rejects.toMatchObject({
            reason: "data-not-ready",
        });
        collector.complete();
        expect(query.assessQuery(handle, request)).toEqual({ status: "ready" });
    });

    test("mixed categorical x and quantitative y support only the requested compatible scope", async () => {
        const { query, handle } = await setup([{ x: "a", y: 1 }], {
            encoding: {
                x: { field: "x", type: "nominal", scale: { domain: ["a"] } },
                y: {
                    field: "y",
                    type: "quantitative",
                    scale: { domain: [0, 2] },
                },
            },
        });
        expect(query.assessQuery(handle, { channels: ["y"] })).toEqual({
            status: "ready",
        });
        expect(
            (await query.queryData(handle, { ...request, channels: ["y"] }))
                .rowsMatched
        ).toBe(1);
        expect(query.assessQuery(handle, request)).toEqual({
            status: "unsupported",
            reason: "unsupported-scale",
        });
        await expect(query.queryData(handle, request)).rejects.toMatchObject({
            reason: "unsupported-scale",
        });
    });

    test("facets are unsupported rather than pending", async () => {
        const { query, handle } = await setup(
            [
                { x: 1, group: "a" },
                { x: 2, group: "b" },
            ],
            {
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    sample: { field: "group" },
                },
            }
        );
        expect(query.assessQuery(handle, request)).toEqual({
            status: "unsupported",
            reason: "multiple-facets",
        });
        await expect(query.queryData(handle, request)).rejects.toMatchObject({
            reason: "multiple-facets",
        });
    });

    test("invalid arguments and unexpected failures propagate", async () => {
        const { query, handle, view } = await setup([{ x: 1 }]);
        expect(() => query.assessQuery(handle, { channels: [] })).toThrow(
            /unique/
        );
        expect(() =>
            query.assessQuery({ view: "missing", scope: [] }, request)
        ).toThrow();
        const collector = /** @type {any} */ (view).getCollector();
        Object.defineProperty(collector, "facetBatches", {
            get() {
                throw new Error("Unexpected failure");
            },
        });
        expect(() => query.assessQuery(handle, request)).toThrow(
            "Unexpected failure"
        );
    });

    test("selection-added axes share encoder validation; cleared selections keep empty semantics", async () => {
        const { query, handle } = await setup([{ x: 1 }], {
            params: [
                {
                    name: "region",
                    select: { type: "interval", encodings: ["y"] },
                },
            ],
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [0, 2] },
                },
                y: { value: 10 },
            },
        });
        handle.params
            .get("region")
            .setValue({ type: "interval", intervals: { y: [0, 20] } });
        const scoped = { ...request, selection: "region" };
        expect(query.assessQuery(handle, scoped)).toEqual({
            status: "unsupported",
            reason: "unsupported-position",
        });
        await expect(query.queryData(handle, scoped)).rejects.toMatchObject({
            reason: "unsupported-position",
        });
        handle.params
            .get("region")
            .setValue({ type: "interval", intervals: { y: null } });
        expect(query.assessQuery(handle, scoped)).toEqual({ status: "ready" });
        expect((await query.queryData(handle, scoped)).rowsMatched).toBe(0);
        expect(
            query.assessQuery(handle, { ...request, selection: "missing" })
        ).toEqual({ status: "unsupported", reason: "unsupported-selection" });
    });
});

test("assessment preserves non-unit and finalized handle distinctions", async () => {
    const { view } = await createHeadlessEngine({
        layer: [
            {
                name: "track",
                mark: "point",
                data: { values: [{ x: 1 }] },
                encoding: { x: { field: "x", type: "quantitative" } },
            },
        ],
    });
    let active = true;
    const api = createViewMutationApi({ viewRoot: view }, () => active);
    const query = createViewQuery(api);
    expect(query.assessQuery(api.root(), request)).toEqual({
        status: "unsupported",
        reason: "non-unit",
    });
    const handle = api.get({ view: "track", scope: [] });
    await /** @type {import("./layerView.js").default} */ (view).removeChildAt(
        0
    );
    expect(() => query.assessQuery(handle, request)).toThrow(
        expect.objectContaining({ code: "staleHandle" })
    );
    active = false;
    expect(() => query.assessQuery(api.root(), request)).toThrow(
        expect.objectContaining({ code: "staleEmbed" })
    );
});

test("assessment and execution reject conditional positions identically", async () => {
    const { query, handle } = await setup([{ x: 1 }], {
        params: [{ name: "p" }],
        encoding: {
            x: {
                field: "x",
                type: "quantitative",
                scale: { domain: [0, 3] },
                condition: { param: "p", datum: 2 },
            },
        },
    });
    expect(query.assessQuery(handle, request)).toEqual({
        status: "unsupported",
        reason: "unsupported-position",
    });
    await expect(query.queryData(handle, request)).rejects.toMatchObject({
        reason: "unsupported-position",
    });
});

describe("scoped analysis", () => {
    test.each([null, 1500])(
        "returns more than 1000 rows with limit %s",
        async (limit) => {
            const rows = Array.from({ length: 1500 }, (_, x) => ({
                x,
                group: x,
            }));
            const { query, handle } = await setup(rows);
            const raw = await query.queryData(handle, { ...request, limit });
            expect(raw.rows).toEqual(
                rows.map(({ x, group }) => ({ x, group }))
            );
            expect(raw.truncated).toBe(false);

            const grouped = await query.queryData(handle, {
                ...request,
                limit,
                fields: ["group"],
                analysis: [
                    {
                        type: "aggregate",
                        groupby: ["group"],
                        ops: ["count"],
                        fields: [null],
                        as: ["count"],
                    },
                ],
            });
            expect(grouped.rows).toEqual(
                rows.map(({ group }) => ({ group, count: 1 }))
            );
            expect(grouped.outputRows).toBe(1500);
            expect(grouped.truncated).toBe(false);
        }
    );

    test("complete output still respects the viewport and analysis filters", async () => {
        const { query, handle } = await setup([
            { x: 1 },
            { x: 2 },
            { x: 6000 },
        ]);
        const result = await query.queryData(handle, {
            ...request,
            limit: null,
            fields: ["x"],
            analysis: [{ type: "filter", field: "x", op: "gt", value: 1 }],
        });
        expect(result.rows).toEqual([{ x: 2 }]);
        expect(result.rowsMatched).toBe(2);
        expect(result.truncated).toBe(false);
    });

    test("groups the full slice before limiting and snapshots its pipeline", async () => {
        const { query, handle } = await setup(
            Array.from({ length: 1500 }, (_, x) => ({
                x,
                group: x % 3,
                value: 1500 - x,
            }))
        );
        /** @type {import("../types/viewQueryApi.js").ViewSliceAnalysisStage[]} */
        const analysis = [
            {
                type: "aggregate",
                groupby: ["group"],
                ops: ["count", "min", "max"],
                fields: [null, "value", "value"],
                as: ["count", "min(value)", "max(value)"],
            },
        ];
        const pending = query.queryData(handle, {
            ...request,
            fields: ["group", "value"],
            limit: 1,
            analysis,
        });
        if (analysis[0].type === "aggregate") analysis[0].as[0] = "changed";
        const result = await pending;
        expect(result).toMatchObject({
            rowsMatched: 1500,
            outputRows: 3,
            truncated: true,
            rows: [
                { group: 0, count: 500, "min(value)": 3, "max(value)": 1500 },
            ],
            scope: {
                analysis: [{ as: ["count", "min(value)", "max(value)"] }],
                sourceCoverage: "unknown",
            },
        });
    });

    test("numeric absolute filters reject invalid values without coercion", async () => {
        const values = [
            -3,
            3,
            -2,
            2,
            null,
            undefined,
            "4",
            NaN,
            Infinity,
            -Infinity,
        ];
        const { query, handle } = await setup(
            values.map((value, x) => ({ x, value }))
        );
        const result = await query.queryData(handle, {
            ...request,
            fields: ["value"],
            limit: 20,
            analysis: [
                {
                    type: "filter",
                    field: "value",
                    op: "gt",
                    value: 2,
                    absolute: true,
                },
            ],
        });
        expect(result).toMatchObject({
            rowsMatched: 10,
            outputRows: 2,
            truncated: false,
            rows: [{ value: -3 }, { value: 3 }],
        });
    });

    test("window leads retain full group counts, stable ties and detached source rows", async () => {
        const { query, handle } = await setup([
            { x: 0, group: "a", p: 4, id: "first" },
            { x: 1, group: "a", p: 1, id: "tie1" },
            { x: 2, group: "a", p: 1, id: "tie2" },
            { x: 3, group: "b", p: 2, id: "other" },
        ]);
        /** @type {import("../types/viewQueryApi.js").ViewSliceAnalysisStage[]} */
        const analysis = [
            {
                type: "window",
                groupby: ["group"],
                sort: { field: "p" },
                ops: ["row_number", "count"],
                as: ["rank", "count"],
                frame: [null, null],
            },
            { type: "filter", field: "rank", op: "eq", value: 1 },
        ];
        const result = await query.queryData(handle, {
            ...request,
            fields: ["group", "p", "id"],
            limit: 10,
            analysis,
        });
        expect(result.rows).toEqual([
            { group: "a", p: 1, id: "tie1", rank: 1, count: 3 },
            { group: "b", p: 2, id: "other", rank: 1, count: 1 },
        ]);
        expect(result).toMatchObject({
            rowsMatched: 4,
            outputRows: 2,
            truncated: false,
        });
        result.rows[0].id = "mutated";
        expect(
            (await query.queryData(handle, { ...request, limit: 10 })).rows[1]
        ).toMatchObject({ id: "tie1" });
        expect(
            (await query.queryData(handle, request)).rows[0]
        ).not.toHaveProperty("rank");
        if (analysis[0].type !== "window") throw new Error("Expected window");
        analysis[0].sort = {
            field: ["p", "id"],
            order: ["ascending", "descending"],
        };
        expect(
            (
                await query.queryData(handle, {
                    ...request,
                    fields: ["group", "p", "id"],
                    analysis,
                })
            ).rows[0].id
        ).toBe("tie2");
    });

    test("projects field paths as literal columns and combines missing groups with null", async () => {
        const { query, handle } = await setup([
            { x: 0, nested: { value: 2 }, group: null },
            { x: 1, nested: { value: 4 } },
        ]);
        const result = await query.queryData(handle, {
            ...request,
            fields: ["nested.value", "group"],
            analysis: [
                { type: "filter", field: "nested.value", op: "gte", value: 2 },
                {
                    type: "aggregate",
                    groupby: ["group"],
                    fields: [null, "nested.value"],
                    ops: ["count", "min"],
                    as: ["count", "min(nested.value)"],
                },
            ],
        });
        expect(result.rows).toEqual([
            { group: null, count: 2, "min(nested.value)": 2 },
        ]);
    });

    test("empty pipelines, populations and limit zero retain output counts", async () => {
        const { query, handle } = await setup([{ x: 1, value: 4 }]);
        expect(
            (
                await query.queryData(handle, {
                    ...request,
                    fields: ["value", "missing", "nested.missing"],
                    analysis: [],
                })
            ).rows
        ).toEqual([{ value: 4, missing: null, "nested.missing": null }]);
        expect(
            await query.queryData(handle, {
                ...request,
                fields: ["value"],
                analysis: [],
                limit: 0,
            })
        ).toMatchObject({
            rows: [],
            rowsMatched: 1,
            outputRows: 1,
            truncated: true,
            scope: { analysis: [] },
        });
        expect(
            await query.queryData(handle, {
                ...request,
                fields: ["value"],
                analysis: [
                    { type: "filter", field: "value", op: "lt", value: 0 },
                    {
                        type: "aggregate",
                        fields: [null],
                        ops: ["count"],
                        as: ["count"],
                    },
                ],
            })
        ).toMatchObject({
            rows: [],
            rowsMatched: 1,
            outputRows: 0,
            truncated: false,
        });
    });

    test("rejects undisclosed, colliding, private and unsupported operations", async () => {
        const { query, handle } = await setup([{ x: 1, value: 4 }]);
        /** @type {Record<string, unknown>[]} */
        const invalid = [
            { analysis: [] },
            { fields: ["value"], aggregate: [], analysis: [] },
            {
                fields: ["value"],
                analysis: [{ type: "filter", field: "x", op: "gt", value: 0 }],
            },
            {
                fields: ["value"],
                analysis: [
                    {
                        type: "filter",
                        field: "value",
                        op: "gt",
                        value: 0,
                        expr: "true",
                    },
                ],
            },
            {
                fields: ["value"],
                analysis: [
                    {
                        type: "aggregate",
                        ops: ["count"],
                        fields: [null],
                        as: ["__proto__"],
                    },
                ],
            },
            {
                fields: ["value"],
                analysis: [
                    {
                        type: "window",
                        ops: ["count"],
                        as: ["value"],
                        frame: [null, null],
                    },
                ],
            },
            {
                fields: ["value"],
                analysis: [
                    {
                        type: "window",
                        ops: ["rank"],
                        as: ["rank"],
                        frame: [null, null],
                    },
                ],
            },
        ];
        for (const options of invalid) {
            await expect(
                query.queryData(
                    handle,
                    /** @type {any} */ ({ ...request, ...options })
                )
            ).rejects.toThrow();
        }
    });

    test("rechecks cancellation and revision between analysis passes", async () => {
        const { query, handle } = await setup([{ x: 1, value: 4 }]);
        const controller = new AbortController();
        const pending = query.queryData(handle, {
            ...request,
            fields: ["value"],
            signal: controller.signal,
            analysis: [{ type: "filter", field: "value", op: "gt", value: 0 }],
        });
        controller.abort();
        await expect(pending).rejects.toThrow();
        const changed = query.queryData(handle, {
            ...request,
            fields: ["value"],
            analysis: [{ type: "filter", field: "value", op: "gt", value: 0 }],
        });
        await handle.getScaleResolution("x").zoomTo([0, 100]);
        await expect(changed).rejects.toThrow(/invalidated/);
    });
});
