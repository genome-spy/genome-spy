import { describe, expect, test } from "vitest";
import {
    createHeadlessEngine,
    createHeadlessViewHierarchy,
} from "../genomeSpy/headlessBootstrap.js";
import { createViewMutationApi } from "./viewMutationApi.js";

/** @param {Record<string, any>[]} rows */
async function setup(rows) {
    const engine = await createHeadlessEngine({
        name: "track",
        title: "Test track",
        data: { values: rows },
        transform: [{ type: "formula", expr: "datum.x * 2", as: "doubled" }],
        mark: "point",
        encoding: {
            x: { field: "x", type: "quantitative", scale: { zoom: true } },
        },
    });
    return createViewMutationApi({ viewRoot: engine.view }).get({
        view: "track",
        scope: [],
    });
}

describe("public view data reads", () => {
    test("reads transformed data with bounded lookahead and detached nested values", async () => {
        const handle = await setup([{ x: 1, nested: { value: 2 } }, { x: 3 }]);
        expect(handle.describe().dataReady).toBe(true);
        const result = handle.readData({ limit: 1 });
        expect(result.rows[0].doubled).toBe(2);
        expect(result.rowsExamined).toBe(2);
        expect(result.truncated).toBe(true);
        /** @type {any} */ (result.rows[0].nested).value = 99;
        expect(handle.readData({ limit: 2 }).rows[0].nested).toEqual({
            value: 2,
        });
        expect(handle.readData({ limit: 2 })).toMatchObject({
            rowsExamined: 2,
            truncated: false,
        });
        expect(handle.readData({ limit: 0 })).toMatchObject({
            rows: [],
            rowsExamined: 1,
            truncated: true,
        });
        const before = handle.readData({ limit: 2 }).rows;
        await handle.getScaleResolution("x").zoomTo([1, 2]);
        expect(handle.readData({ limit: 2 }).rows).toEqual(before);
    });
    test("handles empty data and rejects invalid limits", async () => {
        const handle = await setup([]);
        expect(handle.readData({ limit: 0 })).toMatchObject({
            rows: [],
            rowsExamined: 0,
            truncated: false,
        });
        for (const limit of [-1, 1.5, 1001])
            expect(() => handle.readData({ limit })).toThrow();
    });
    test("rejects containers and finalized handles", async () => {
        const { view } = await createHeadlessViewHierarchy({ vconcat: [] });
        let active = true;
        const api = createViewMutationApi({ viewRoot: view }, () => active);
        expect(() => api.root().readData({ limit: 1 })).toThrow();
        active = false;
        expect(() => api.root().describe()).toThrow();
    });
});

test("metadata is detached and reads reject a view before data initialization", async () => {
    const handle = await setup([{ x: 1 }]);
    const description = handle.describe();
    description.encoding.x = { value: 123 };
    expect(handle.describe().encoding.x).toMatchObject({ field: "x" });
    const { view } = await createHeadlessViewHierarchy({
        name: "unready",
        data: { values: [{ x: 1 }] },
        mark: "point",
        encoding: { x: { field: "x", type: "quantitative" } },
    });
    const unready = createViewMutationApi({ viewRoot: view }).get({
        view: "unready",
        scope: [],
    });
    expect(unready.describe().dataReady).toBe(false);
    expect(() => unready.readData({ limit: 1 })).toThrow("not ready");
});

describe("view read lifecycle", () => {
    test.each(["removed", "finalized"])(
        "rejects all accessors after the view is %s",
        async (state) => {
            const { view } = await createHeadlessEngine({
                layer: [
                    {
                        name: "track",
                        data: { values: [{ x: 1 }] },
                        mark: "point",
                        encoding: { x: { field: "x", type: "quantitative" } },
                    },
                ],
            });
            let active = true;
            const api = createViewMutationApi({ viewRoot: view }, () => active);
            const handle = api.get({ view: "track", scope: [] });
            expect(handle.readData({ limit: 1 }).rows).toHaveLength(1);

            if (state === "removed") {
                await /** @type {import("./layerView.js").default} */ (
                    view
                ).removeChildAt(0);
            } else {
                active = false;
            }

            for (const read of [
                () => handle.describe(),
                () => handle.readData({ limit: 1 }),
                () => handle.getScaleResolution("x"),
            ]) {
                expect(read).toThrow(
                    expect.objectContaining({
                        code:
                            state === "removed" ? "staleHandle" : "staleEmbed",
                    })
                );
            }
        }
    );
});

test("returns existing unnamed scales, absent scales, and rejects invalid channels", async () => {
    const { view } = await createHeadlessEngine({
        name: "track",
        data: { values: [{ x: 1 }] },
        mark: "point",
        encoding: { x: { field: "x", type: "quantitative" } },
    });
    const api = createViewMutationApi({ viewRoot: view });
    const handle = api.get({ view: "track", scope: [] });
    expect(handle.getScaleResolution("x")).toBe(view.getScaleResolution("x"));
    expect(handle.getScaleResolution("x")).toBeDefined();
    expect(handle.getScaleResolution("y")).toBeUndefined();
    for (const channel of ["color", undefined]) {
        expect(() =>
            handle.getScaleResolution(/** @type {any} */ (channel))
        ).toThrow("Expected positional channel");
    }
});

test("non-cloneable returned values reject without modifying source data", async () => {
    const { view } = await createHeadlessEngine({
        name: "track",
        data: { values: [{ x: 1 }] },
        mark: "point",
        encoding: { x: { field: "x", type: "quantitative" } },
    });
    const handle = createViewMutationApi({ viewRoot: view }).get({
        view: "track",
        scope: [],
    });
    // Loading itself clones source values. Add a runtime-only value afterward
    // so this test reaches the public read boundary rather than failing at load.
    const datum = /** @type {import("./unitView.js").default} */ (view)
        .getCollector()
        .getData()
        [Symbol.iterator]()
        .next().value;
    const callback = () => 42;
    datum.callback = callback;
    expect(handle.describe().dataReady).toBe(true);
    // An empty read only looks ahead; it does not clone the unreturned datum.
    expect(handle.readData({ limit: 0 }).truncated).toBe(true);
    expect(() => handle.readData({ limit: 1 })).toThrow(
        expect.objectContaining({ name: "DataCloneError" })
    );
    expect(datum.callback).toBe(callback);
});

test("rejects multiple facet batches produced by the dataflow", async () => {
    // Core's collect transform groups rows into facet batches without an App view.
    const { view } = await createHeadlessEngine({
        name: "track",
        data: {
            values: [
                { x: 1, group: "A" },
                { x: 2, group: "B" },
            ],
        },
        transform: [{ type: "collect", groupby: ["group"] }],
        mark: "point",
        encoding: { x: { field: "x", type: "quantitative" } },
    });
    const handle = createViewMutationApi({ viewRoot: view }).get({
        view: "track",
        scope: [],
    });
    expect(handle.describe().dataReady).toBe(true);
    expect(() => handle.readData({ limit: 1 })).toThrow(
        "Faceted data reads are not supported"
    );
});
