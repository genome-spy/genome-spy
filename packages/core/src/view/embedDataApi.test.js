import { expect, test, vi } from "vitest";
import {
    createHeadlessEngine,
    createHeadlessViewHierarchy,
} from "../genomeSpy/headlessBootstrap.js";
import { createViewMutationApi } from "./viewMutationApi.js";

/**
 * An inherited selection also exercises lexical ownership and disabled picking.
 * @param {"point" | "text" | "rect"} [mark]
 * @param {boolean} [toggle]
 */
async function setup(mark = "point", toggle = true) {
    const { view: root } = await createHeadlessEngine({
        params: [{ name: "selected", select: { type: "point", toggle } }],
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
    let active = true;
    const views = createViewMutationApi({ viewRoot: root }, () => active);
    const handle = views.get({ scope: [], view: "records" });
    const selected = handle.params.getSelection("selected");
    if (selected.type !== "point") throw new Error("Expected point selection.");
    const unit = /** @type {import("./unitView.js").default} */ (
        root.getDescendants().find((view) => view.spec.name === "records")
    );
    return {
        root,
        views,
        handle,
        selected,
        unit,
        finalize: () => {
            active = false;
        },
    };
}

test("reads bounded transformed records with cloned values and no picking identifiers", async () => {
    const { handle, unit, views } = await setup();
    const result = handle.readData({ limit: 1 });
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
    const complete = handle.readData({ limit: 3 });
    expect(complete.rows.map((row) => row.id)).toEqual(["A", "C", "B"]);
    expect(complete.rows[0].nested).toEqual({ note: "original" });
    expect(complete.truncated).toBe(false);
    expect(handle.readData({ limit: 0 })).toEqual({
        rows: [],
        truncated: true,
    });
    await unit.getScaleResolution("x").zoomTo([1, 2], 0);
    expect(handle.readData({ limit: 3 })).toEqual(complete);
    for (const limit of [undefined, -1, 0.5, Infinity])
        expect(() => handle.readData({ limit })).toThrow("limit");
    expect(() => views.root().readData({ limit: 1 })).toThrow("unit view");
});

test.each(["point", "text", "rect"])(
    "writes inherited native selection for %s marks without picking",
    async (mark) => {
        const { root, selected, unit } = await setup(
            /** @type {"point" | "text" | "rect"} */ (mark)
        );
        const listener = vi.fn();
        const stop = selected.subscribe(listener);
        selected.setValue([
            [1, "B"],
            [2, "C"],
        ]);
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
    expect(handle.readData({ limit: 10 })).toEqual({
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
    expect(handle.readData({ limit: 0 })).toEqual({
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
        expect(() => handle.readData({ limit: 1 })).toThrow();
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
    const selected = handle.params.getSelection("selected");
    if (selected.type !== "point") throw new Error("Expected point selection.");
    expect(() => handle.readData({ limit: 1 })).toThrow("not ready");
    expect(() => selected.setValue([["A"]])).toThrow("not ready");
    selected.setValue([]);
    delete view.spec.encoding.key;
    expect(() => selected.setValue([["A"]])).toThrow("encoding.key");
});
