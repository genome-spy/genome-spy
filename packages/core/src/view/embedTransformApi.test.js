import { afterEach, expect, test, vi } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { intervalSelection } from "../selection/index.js";
import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import FormulaTransform from "../data/transforms/formula.js";
import { createViewMutationApi } from "./viewMutationApi.js";

const viewport = { scope: "viewport", inputLimit: 10, limit: 10 };

/** Uses a real authored transform before the additional analysis pipeline. */
async function setup() {
    const { view: root } = await createHeadlessEngine({
        name: "measurements",
        params: [
            { name: "brush", select: { type: "interval", encodings: ["x"] } },
            { name: "selected", select: "point" },
            { name: "threshold", value: 7 },
        ],
        data: {
            values: [
                {
                    id: "A1",
                    group: "A",
                    value: 1,
                    nested: { note: "original" },
                },
                { id: "A3", group: "A", value: 3 },
                { id: "B2", group: "B", value: 2 },
                { id: "B6", group: "B", value: 6 },
                { id: "hidden", group: "A", value: -1 },
            ],
        },
        transform: [
            { type: "filter", expr: "datum.value > 0" },
            { type: "formula", expr: "datum.value * 10", as: "derived" },
        ],
        mark: "point",
        encoding: {
            key: { field: "id" },
            x: {
                field: "value",
                type: "quantitative",
                scale: { domain: [0, 10], zoom: true },
            },
        },
    });
    const views = createViewMutationApi({ viewRoot: root });
    const handle = views.get({ scope: [], view: "measurements" });
    const unit = /** @type {import("./unitView.js").default} */ (
        root.getDescendants().find((view) => view.spec.name === "measurements")
    );
    return { root, views, handle, unit };
}

afterEach(() => vi.restoreAllMocks());

test("captures brushed transformed records before analysis and limits only complete summaries", async () => {
    const { root, handle, unit } = await setup();
    handle.params.get("brush").setValue(intervalSelection({ x: [2, 7] }));
    await root.paramRuntime.whenPropagated();
    const collector = unit.getCollector();
    const before = structuredClone(Array.from(collector.getData()));
    const revision = collector.dataRevision;
    const markRevision = unit.mark.getEncodedDataRevision();
    const listener = vi.fn();
    const stop = collector.observe(listener);
    const render = vi.spyOn(root.context.animator, "requestRender");
    const result = handle.transformData({
        scope: { selection: "brush" },
        inputLimit: 3,
        limit: 1,
        transform: [
            { type: "formula", expr: "datum.derived + 1", as: "score" },
            {
                type: "aggregate",
                groupby: ["group"],
                fields: ["score", "score"],
                ops: ["count", "mean"],
                as: ["count", "mean"],
            },
        ],
    });
    // Both B records contribute, even though only one summary is returned.
    expect(result).toEqual({
        rows: [{ group: "B", count: 2, mean: 41 }],
        truncated: true,
    });
    await root.paramRuntime.whenPropagated();
    expect(Array.from(collector.getData())).toEqual(before);
    expect(collector.dataRevision).toBe(revision);
    expect(unit.mark.getEncodedDataRevision()).toBe(markRevision);
    expect(listener).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    stop();
});

test("runs window/filter and sample pipelines while preserving keys and native selection", async () => {
    const { handle } = await setup();
    const selected = handle.params.getSelection("selected");
    if (selected.type !== "point") throw new Error("Expected point selection.");
    selected.setValue([["A1"]]);
    const result = handle.transformData({
        ...viewport,
        scope: "viewport",
        transform: [
            {
                type: "window",
                sort: { field: "derived", order: "descending" },
                ops: ["row_number"],
                as: ["rank"],
            },
            { type: "filter", expr: "datum.rank <= 2" },
        ],
    });
    expect(result.rows.map((row) => row.id)).toEqual(["A3", "B6"]);
    expect(result.rows.map((row) => row.rank)).toEqual([2, 1]);
    expect(selected.getValue().data.map((row) => row.id)).toEqual(["A1"]);
    selected.setValue(result.rows.map((row) => [String(row.id)]));
    expect(selected.getValue().data.map((row) => row.id)).toEqual(["A3", "B6"]);
    const sample = handle.transformData({
        ...viewport,
        scope: "viewport",
        transform: [{ type: "sample", size: 2 }],
    });
    expect(sample.truncated).toBe(false);
    expect(sample.rows).toHaveLength(2);
    expect(new Set(sample.rows.map((row) => row.id)).size).toBe(2);
    expect(
        sample.rows.every((row) =>
            ["A1", "A3", "B2", "B6"].includes(String(row.id))
        )
    ).toBe(true);
});

test("rejects input overflow before executing transforms and follows viewport navigation", async () => {
    const { handle, unit } = await setup();
    const initialize = vi.spyOn(FormulaTransform.prototype, "initialize");
    expect(() =>
        handle.transformData({
            ...viewport,
            scope: "viewport",
            inputLimit: 3,
            transform: [
                { type: "formula", expr: "datum.value * 2", as: "score" },
            ],
        })
    ).toThrow("inputLimit");
    expect(initialize).not.toHaveBeenCalled();
    await unit.getScaleResolution("x").zoomTo([2, 3], 0);
    expect(
        handle.transformData({
            scope: "viewport",
            inputLimit: 2,
            limit: 0,
            transform: [{ type: "aggregate" }],
        })
    ).toEqual({ rows: [], truncated: true });
    expect(
        handle.transformData({
            scope: "viewport",
            inputLimit: 2,
            limit: 1,
            transform: [{ type: "aggregate" }],
        })
    ).toEqual({ rows: [{ count: 2 }], truncated: false });
});

test("retains existing empty-input transform semantics and detached results", async () => {
    const { handle } = await setup();
    const scope = { selection: "brush" };
    expect(
        handle.transformData({
            scope,
            inputLimit: 0,
            limit: 1,
            transform: [{ type: "aggregate" }],
        })
    ).toEqual({ rows: [], truncated: false });
    expect(
        handle.transformData({
            scope,
            inputLimit: 0,
            limit: 1,
            transform: [{ type: "aggregate", groupby: ["group"] }],
        })
    ).toEqual({ rows: [], truncated: false });
    const result = handle.transformData({
        ...viewport,
        scope: "viewport",
        transform: [],
    });
    /** @type {{note: string}} */ (result.rows[0].nested).note = "changed";
    expect(
        handle.readData({ scope: "viewport", limit: 1 }).rows[0].nested
    ).toEqual({ note: "original" });
});

test("rejects unsupported requests and disposes private runtime on success and expression failures", async () => {
    const { handle } = await setup();
    const dispose = vi.spyOn(ViewParamRuntime.prototype, "dispose");
    handle.transformData({ ...viewport, scope: "viewport", transform: [] });
    for (const expr of [
        "datum.value +",
        "datum.value + threshold",
        "datum.missing + 1",
    ]) {
        expect(() =>
            handle.transformData({
                ...viewport,
                scope: "viewport",
                transform: [{ type: "formula", expr, as: "score" }],
            })
        ).toThrow();
    }
    expect(dispose).toHaveBeenCalledTimes(4);
    for (const transform of [
        [{ type: "lookup", from: { source: "input" } }],
        [{ type: "filter", param: "selected" }],
        [{ type: "filter", expr: "true", debounce: 0 }],
        [{ type: "sample", size: 0 }],
        [{ type: "sample", size: 1.5 }],
        null,
    ]) {
        expect(() =>
            handle.transformData({
                ...viewport,
                scope: "viewport",
                transform: /** @type {any} */ (transform),
            })
        ).toThrow();
    }
    for (const invalid of [-1, 0.5, Infinity, undefined]) {
        expect(() =>
            handle.transformData({
                scope: "viewport",
                inputLimit: invalid,
                limit: 1,
                transform: [],
            })
        ).toThrow("inputLimit");
        expect(() =>
            handle.transformData({
                scope: "viewport",
                inputLimit: 10,
                limit: invalid,
                transform: [],
            })
        ).toThrow("limit");
    }
});

test("rejects unready, container, removed and finalized view handles", async () => {
    const { root, handle } = await setup();
    /** @type {import("../types/embedApi.js").TransformDataOptions} */
    const request = {
        ...viewport,
        scope: /** @type {const} */ ("viewport"),
        transform: [],
    };
    let active = true;
    const views = createViewMutationApi({ viewRoot: root }, () => active);
    const live = views.get({ scope: [], view: "measurements" });
    const collector = /** @type {import("./unitView.js").default} */ (
        root
    ).getCollector();
    collector.reset();
    expect(() => handle.transformData(request)).toThrow("not ready");
    active = false;
    expect(() => live.transformData(request)).toThrow();
    const { view: container } = await createHeadlessEngine({
        layer: [
            {
                name: "child",
                data: { values: [{ x: 1 }] },
                mark: "point",
                encoding: { x: { field: "x", type: "quantitative" } },
            },
        ],
    });
    const api = createViewMutationApi({ viewRoot: container });
    expect(() => api.root().transformData(request)).toThrow("unit view");
    const child = api.get({ scope: [], view: "child" });
    await api.remove(child);
    expect(() => child.transformData(request)).toThrow();
});
