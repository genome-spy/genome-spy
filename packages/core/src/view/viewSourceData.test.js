import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { createViewMutationApi } from "./viewMutationApi.js";
import { createViewQuery } from "../viewQuery.js";
import InlineSource from "../data/sources/inlineSource.js";

/** @param {import('../spec/root.js').RootSpec} spec */
async function setup(spec) {
    const { view, context } = await createHeadlessEngine(spec);
    const views = createViewMutationApi({ viewRoot: view });
    return { view, context, views, query: createViewQuery(views) };
}

/** @type {import("../spec/channel.js").Encoding} */
const encoding = { x: { field: "x", type: "quantitative" } };

/** @param {import('./view.js').default} view */
function inlineSource(view) {
    const source = view.flowHandle.dataSource;
    if (!(source instanceof InlineSource))
        throw new Error("Expected inline fixture");
    return source;
}

describe("retained source inspection", () => {
    test("preserves rows omitted by display filters and avoids computed fields", async () => {
        // Gene-like lane filtering must not turn a source read into a three-lane preview.
        const rows = Array.from({ length: 10 }, (_, x) => ({
            x,
            nested: { x },
        }));
        const { view, query } = await setup({
            data: { values: rows, retainForInspection: true },
            transform: [
                { type: "formula", expr: "datum.x % 5", as: "lane" },
                { type: "filter", expr: "datum.lane < 3" },
            ],
            mark: "point",
            encoding,
        });
        expect(query.readData("root", { limit: 20 }).rows).toHaveLength(6);
        const result = query.readSourceData("root", { limit: null });
        expect(result).toMatchObject({
            rows: rows,
            rowsExamined: 10,
            truncated: false,
            scope: "loaded-source",
        });
        expect(result.rows.some((row) => "lane" in row)).toBe(false);
        /** @type {{x: number}} */ (result.rows[0].nested).x = 99;
        expect(
            query.readSourceData("root", { limit: 1 }).rows[0].nested
        ).toEqual({ x: 0 });

        const revision = result.dataRevision;
        inlineSource(view).updateDynamicData([{ x: 20 }]);
        expect(query.readSourceData("root", { limit: null }).rows).toEqual([
            { x: 20 },
        ]);
        expect(
            query.readSourceData("root", { limit: null }).dataRevision
        ).toBeGreaterThan(revision);
    });

    test("bounds reads explicitly and handles empty sources", async () => {
        const { view, query } = await setup({
            data: { values: [{ x: 1 }, { x: 2 }], retainForInspection: true },
            mark: "point",
            encoding,
        });
        expect(query.readSourceData("root", { limit: 1 })).toMatchObject({
            rows: [{ x: 1 }],
            rowsExamined: 2,
            truncated: true,
        });
        expect(query.readSourceData("root", { limit: 0 })).toMatchObject({
            rows: [],
            rowsExamined: 1,
            truncated: true,
        });
        for (const limit of [
            undefined,
            -1,
            1.5,
            Infinity,
            Number.MAX_SAFE_INTEGER + 1,
        ]) {
            expect(() => query.readSourceData("root", { limit })).toThrow(
                "Source read limit"
            );
        }
        inlineSource(view).updateDynamicData([]);
        expect(query.readSourceData("root", { limit: null })).toMatchObject({
            rows: [],
            rowsExamined: 0,
            truncated: false,
        });
    });

    test("resolves inherited sources without bypassing an overriding source", async () => {
        const { query } = await setup({
            data: { values: [{ x: 1 }], retainForInspection: true },
            layer: [
                { name: "inherited", mark: "point", encoding },
                {
                    name: "override",
                    data: { values: [{ x: 2 }] },
                    mark: "point",
                    encoding,
                },
            ],
        });
        expect(
            query.readSourceData(
                { view: "inherited", scope: [] },
                { limit: null }
            ).rows
        ).toEqual([{ x: 1 }]);
        expect(() =>
            query.readSourceData(
                { view: "override", scope: [] },
                { limit: null }
            )
        ).toThrow("retainForInspection");
    });

    test("does not retain by default and rejects removed source owners", async () => {
        const plain = await setup({
            data: { values: [{ x: 1 }] },
            mark: "point",
            encoding,
        });
        expect(plain.context.dataFlow.collectors).toHaveLength(1);
        expect(() =>
            plain.query.readSourceData("root", { limit: null })
        ).toThrow("retainForInspection");

        const { views, query, context } = await setup({
            vconcat: [
                {
                    name: "track",
                    data: { values: [{ x: 1 }], retainForInspection: true },
                    mark: "point",
                    encoding,
                },
            ],
        });
        const handle = views.get({ view: "track", scope: [] });
        const retained = context.dataFlow.collectors.filter(
            (collector) =>
                collector.parent ===
                context.dataFlow.dataSources.find(
                    (source) => source.view.spec.name === "track"
                )
        );
        expect(retained).toHaveLength(1);
        await views.remove(handle);
        expect(context.dataFlow.collectors).not.toContain(retained[0]);
        expect(retained[0].disposed).toBe(true);
        expect(() => query.readSourceData(handle, { limit: null })).toThrow();
    });
});
