import { expect, test, vi } from "vitest";
import { createHeadlessViewHierarchy } from "../genomeSpy/headlessBootstrap.js";
import { createTestEmbed, getPointSelection } from "./embedTestUtils.js";
import GenomeStore from "../genome/genomeStore.js";
import { intervalSelection } from "../selection/index.js";
import { createViewMutationApi } from "./viewMutationApi.js";

/**
 * An inherited selection also exercises lexical ownership and disabled picking.
 * @param {"point" | "text" | "rect"} [mark]
 * @param {boolean} [toggle]
 */
async function setup(mark = "point", toggle = true) {
    const fixture = await createTestEmbed({
        params: [
            { name: "selected", select: { type: "point", toggle } },
            { name: "brush", select: { type: "interval", encodings: ["x"] } },
        ],
        datasets: {
            rows: [
                { id: "A", group: 1, value: 1, nested: { note: "original" } },
                { id: "B", group: 1, value: 4 },
                { id: "C", group: 2, value: 2 },
                { id: "hidden", group: 2, value: -1 },
            ],
        },
        layer: [
            {
                name: "records",
                data: { name: "rows" },
                transform: [
                    { type: "filter", expr: "datum.value > 0" },
                    { type: "formula", expr: "datum.value * 2", as: "score" },
                ],
                mark: { type: mark, tooltip: null },
                encoding: {
                    key: [{ field: "group" }, { field: "id" }],
                    x: {
                        field: "value",
                        type: "quantitative",
                        scale: { domain: [0, 5], zoom: true },
                    },
                    text: { field: "id" },
                    opacity: {
                        condition: {
                            param: "selected",
                            empty: false,
                            value: 1,
                        },
                        value: 0.2,
                    },
                },
            },
        ],
    });
    const { root, views } = fixture;
    const handle = views.get({ scope: [], view: "records" });
    const unit = /** @type {import("./unitView.js").default} */ (
        root.getDescendants().find((view) => view.spec.name === "records")
    );
    return { ...fixture, handle, selected: getPointSelection(handle), unit };
}

test("reads bounded transformed records with cloned values and no picking identifiers", async () => {
    const { handle, unit, views } = await setup();
    const result = handle.data.read({ scope: "viewport", limit: 1 });
    expect(result).toEqual({
        rows: [
            {
                id: "A",
                group: 1,
                value: 1,
                score: 2,
                nested: { note: "original" },
            },
        ],
        truncated: true,
    });
    /** @type {{note: string}} */ (result.rows[0].nested).note = "changed";
    const complete = handle.data.read({ scope: "viewport", limit: 3 });
    expect(complete.rows.map((row) => row.id)).toEqual(["A", "C", "B"]);
    expect(complete.rows[0].nested).toEqual({ note: "original" });
    expect(complete.truncated).toBe(false);
    expect(handle.data.read({ scope: "viewport", limit: 0 })).toEqual({
        rows: [],
        truncated: true,
    });
    await unit.getScaleResolution("x").zoomTo([1, 2], 0);
    expect(
        handle.data
            .read({ scope: "viewport", limit: 3 })
            .rows.map((row) => row.id)
    ).toEqual(["A", "C"]);
    await unit.getScaleResolution("x").zoomTo([3, 5], 0);
    expect(handle.data.read({ scope: "viewport", limit: 1 })).toEqual({
        rows: [{ id: "B", group: 1, value: 4, score: 8 }],
        truncated: false,
    });
    for (const limit of [undefined, -1, 0.5, Infinity])
        expect(() => handle.data.read({ scope: "viewport", limit })).toThrow(
            "limit"
        );
    expect(() =>
        views.root().data.read({ scope: "viewport", limit: 1 })
    ).toThrow("unit view");
});

test("all-data reads ignore viewport and brush while retaining copy and limit semantics", async () => {
    const { root, unit, handle, views } = await setup();
    await unit.getScaleResolution("x").zoomTo([3, 5], 0);
    handle.params.get("brush").setValue(intervalSelection({ x: [0, 2] }));
    await root.paramRuntime.whenPropagated();
    const result = handle.data.read({ scope: "all", limit: 3 });
    expect(result.rows.map((row) => row.id)).toEqual(["A", "C", "B"]);
    expect(result.truncated).toBe(false);
    expect(result.rows.every((row) => !("__uniqueId" in row))).toBe(true);
    /** @type {{note: string}} */ (result.rows[0].nested).note = "changed";
    expect(handle.data.read({ scope: "all", limit: 1 })).toMatchObject({
        rows: [{ id: "A", score: 2, nested: { note: "original" } }],
        truncated: true,
    });
    expect(handle.data.read({ scope: "all", limit: 0 })).toEqual({
        rows: [],
        truncated: true,
    });
    views.root().datasets.set("rows", [{ id: "new", group: 1, value: 9 }]);
    expect(handle.data.read({ scope: "all", limit: 2 })).toEqual({
        rows: [{ id: "new", group: 1, value: 9, score: 18 }],
        truncated: false,
    });
    views.root().datasets.set("rows", []);
    expect(handle.data.read({ scope: "all", limit: 0 })).toEqual({
        rows: [],
        truncated: false,
    });
});

test.each([
    {},
    { x: { field: "id", type: "nominal", scale: { domain: ["A"] } } },
    {
        x: {
            condition: { param: "choose", field: "x", type: "quantitative" },
            value: 0,
        },
    },
])(
    "all-data reads do not require a supported positional projection: %j",
    async (encoding) => {
        const { views } = await createTestEmbed({
            params: [{ name: "choose", select: "point" }],
            data: { values: [{ id: "A", x: 1 }] },
            mark: { type: "point", tooltip: null },
            encoding: /** @type {import("../spec/channel.js").Encoding} */ (
                encoding
            ),
        });
        const handle = views.root();
        expect(handle.data.read({ scope: "all", limit: 1 })).toEqual({
            rows: [{ id: "A", x: 1 }],
            truncated: false,
        });
        expect(() =>
            handle.data.read({ scope: "viewport", limit: 1 })
        ).toThrow();
    }
);

test.each(["point", "text", "rect"])(
    "writes inherited native selection for %s marks without picking",
    async (mark) => {
        const { root, selected, unit } = await setup(
            /** @type {"point" | "text" | "rect"} */ (mark)
        );
        const listener = vi.fn();
        const stop = selected.subscribe(listener);
        const keys = Object.freeze([
            Object.freeze([1, "B"]),
            Object.freeze([2, "C"]),
        ]);
        selected.setValue(keys);
        await root.paramRuntime.whenPropagated();
        expect(selected.getValue().data.map((row) => row.id)).toEqual([
            "B",
            "C",
        ]);
        expect(listener).toHaveBeenCalledTimes(1);
        const data = Array.from(unit.getCollector().getData());
        expect(
            data.map((datum) =>
                unit.mark.encoders[mark === "text" ? "opacity" : "fillOpacity"](
                    datum
                )
            )
        ).toEqual([0.2, 1, 1]);
        expect(unit.mark.encoding.uniqueId).toBeDefined();
        expect(unit.mark.isPickingParticipant()).toBe(false);
        selected.setValue([]);
        expect(selected.getValue()).toMatchObject({ active: false, data: [] });
        stop();
    }
);

test("rejects invalid key writes atomically and enforces single membership", async () => {
    const { selected } = await setup("point", false);
    selected.setValue([[1, "B"]]);
    for (const keys of [
        [
            [1, "A"],
            [2, "C"],
        ],
        [[2, "missing"]],
        [[1]],
        [[null, "A"]],
        [[Infinity, "A"]],
    ]) {
        expect(() => selected.setValue(keys)).toThrow();
        expect(selected.getValue().data[0].id).toBe("B");
    }
});

test("resolves new data publications and rejects duplicate keys", async () => {
    const { views, handle, selected } = await setup();
    selected.setValue([[1, "B"]]);
    selected.clear();
    views.root().datasets.set("rows", [{ id: "new", group: 1, value: 3 }]);
    expect(handle.data.read({ scope: "viewport", limit: 10 })).toEqual({
        rows: [{ id: "new", group: 1, value: 3, score: 6 }],
        truncated: false,
    });
    selected.setValue([[1, "new"]]);
    expect(selected.getValue().data[0].score).toBe(6);
    selected.clear();
    views.root().datasets.set("rows", [
        { id: "same", group: 1, value: 1 },
        { id: "same", group: 1, value: 2 },
    ]);
    expect(() => selected.setValue([[1, "same"]])).toThrow("Duplicate key");
    views.root().datasets.set("rows", []);
    expect(handle.data.read({ scope: "viewport", limit: 0 })).toEqual({
        rows: [],
        truncated: false,
    });
});

test.each(["removed", "finalized"])(
    "rejects reads and writes after a view is %s",
    async (state) => {
        const { views, handle, selected, finalize } = await setup();
        if (state === "removed") await views.remove(handle);
        else finalize();
        expect(() =>
            handle.data.read({ scope: "viewport", limit: 1 })
        ).toThrow();
        expect(() => selected.setValue([[1, "A"]])).toThrow();
    }
);

test("rejects unready or unkeyed writes, but allows clearing before data is ready", async () => {
    const { view } = await createHeadlessViewHierarchy({
        params: [{ name: "selected", select: "point" }],
        data: { values: [{ id: "A" }] },
        mark: "point",
        encoding: { key: { field: "id" } },
    });
    const handle = createViewMutationApi({ viewRoot: view }).root();
    const selected = getPointSelection(handle);
    expect(() => handle.data.read({ scope: "viewport", limit: 1 })).toThrow(
        "not ready"
    );
    expect(() => selected.setValue([["A"]])).toThrow("not ready");
    selected.setValue([]);
    delete view.spec.encoding.key;
    expect(() => selected.setValue([["A"]])).toThrow("encoding.key");
});

test("reads brush membership independently of viewport, before limiting matches", async () => {
    const { root, unit, handle } = await setup();
    const scope = { selection: "brush" };
    expect(handle.data.read({ scope, limit: 10 })).toEqual({
        rows: [],
        truncated: false,
    });
    handle.params.get("brush").setValue(intervalSelection({ x: [2, 5] }));
    await root.paramRuntime.whenPropagated();
    expect(handle.data.read({ scope, limit: 1 })).toMatchObject({
        rows: [{ id: "C" }],
        truncated: true,
    });
    await unit.getScaleResolution("x").zoomTo([0, 1], 0);
    expect(
        handle.data.read({ scope, limit: 10 }).rows.map((row) => row.id)
    ).toEqual(["C", "B"]);
    handle.params.get("brush").setValue(intervalSelection({ x: [3, 4] }));
    await root.paramRuntime.whenPropagated();
    expect(handle.data.read({ scope, limit: 0 })).toEqual({
        rows: [],
        truncated: false,
    });
    for (const invalid of [
        undefined,
        "loaded",
        { selection: "selected" },
        { selection: "missing" },
    ]) {
        expect(() =>
            handle.data.read({ scope: /** @type {any} */ (invalid), limit: 1 })
        ).toThrow();
    }
});

test("viewport reads intersect ranged marks on both axes", async () => {
    const { views } = await createTestEmbed({
        name: "ranges",
        data: {
            values: [
                { id: "overlap", start: 0, end: 11, y: 0.5 },
                { id: "touch", start: 20, end: 30, y: 0.5 },
                { id: "outsideY", start: 12, end: 18, y: 2 },
                { id: "reversed", start: 18, end: 12, y: 0.5 },
            ],
        },
        mark: "rect",
        encoding: {
            x: {
                field: "start",
                type: "quantitative",
                scale: { domain: [10, 20] },
            },
            x2: { field: "end" },
            y: { field: "y", type: "quantitative", scale: { domain: [0, 1] } },
            y2: { field: "y" },
        },
    });
    const handle = views.get({ scope: [], view: "ranges" });
    expect(
        handle.data
            .read({ scope: "viewport", limit: 10 })
            .rows.map((row) => row.id)
            .sort()
    ).toEqual(["overlap", "reversed"]);
});

test("scoped reads use normalized locus positions and scaled constants", async () => {
    const genomeStore = new GenomeStore(".");
    await genomeStore.initialize({
        name: "toy",
        contigs: [
            { name: "chr1", size: 100 },
            { name: "chr2", size: 1000 },
        ],
    });
    const { root: view, views } = await createTestEmbed(
        {
            name: "bases",
            assembly: "toy",
            params: [
                {
                    name: "brush",
                    select: { type: "interval", encodings: ["x"] },
                },
            ],
            data: {
                values: [100, 102, 105].map((pos) => ({
                    chrom: "chr2",
                    pos,
                    base: "A",
                })),
            },
            mark: "text",
            encoding: {
                x: {
                    chrom: "chrom",
                    pos: "pos",
                    type: "locus",
                    scale: {
                        domain: [
                            { chrom: "chr2", pos: 100 },
                            { chrom: "chr2", pos: 103 },
                        ],
                    },
                },
                y: {
                    datum: 0,
                    type: "quantitative",
                    scale: { domain: [-1, 1] },
                },
                text: { field: "base" },
            },
        },
        { contextOptions: { genomeStore } }
    );
    const handle = views.get({ scope: [], view: "bases" });
    expect(
        handle.data
            .read({ scope: "viewport", limit: 10 })
            .rows.map((row) => row.pos)
    ).toEqual([100, 102]);
    // The brush stores concatenated genome coordinates, including chr1's offset.
    handle.params.get("brush").setValue(intervalSelection({ x: [201, 204] }));
    await view.paramRuntime.whenPropagated();
    expect(
        handle.data
            .read({ scope: { selection: "brush" }, limit: 10 })
            .rows.map((row) => row.pos)
    ).toEqual([102]);
});

test("viewport reads reject discrete positional scales", async () => {
    const { views } = await createTestEmbed({
        name: "categorical",
        data: { values: [{ x: "A" }, { x: "B" }] },
        mark: "point",
        encoding: {
            x: {
                field: "x",
                type: "nominal",
                scale: { type: "point", domain: ["A", "B"] },
            },
        },
    });
    const handle = views.get({ scope: [], view: "categorical" });
    expect(() => handle.data.read({ scope: "viewport", limit: 10 })).toThrow(
        "continuous positional scales"
    );
});
