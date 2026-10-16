import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { createViewMutationApi } from "./viewMutationApi.js";
import { createViewQuery } from "../viewQuery.js";

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
    test("filters before limiting and records the full matching population and scope", async () => {
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
        });
        expect(result).toMatchObject({
            rows: [{ x: 2000 }, { x: 2001 }],
            rowsExamined: 3000,
            rowsMatched: 200,
            truncated: true,
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

    test("empty slices return zero matches without truncation", async () => {
        const { query, handle } = await setup([{ x: 1 }]);
        await handle.getScaleResolution("x").zoomTo([10, 20]);
        expect(await query.queryData(handle, request)).toMatchObject({
            rows: [],
            rowsMatched: 0,
            truncated: false,
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
        "rejects private or identity field path %s in projected rows",
        async (name) => {
            const { query, handle } = await setup([{ x: 1 }]);
            await expect(
                query.queryData(handle, {
                    ...request,
                    fields: [name],
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
        });
        expect(result.rows).toEqual([
            {
                "nested.__uniqueId": 7,
                'nested["__uniqueId"]': 7,
                "a\\.b": 3,
            },
        ]);
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
            { ...request, aggregate: [] },
            { ...request, analysis: [] },
            { ...request, includeAnnotationTargets: true },
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
