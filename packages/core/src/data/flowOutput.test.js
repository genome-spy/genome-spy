import { readFileSync } from "node:fs";
import { expect, onTestFinished, test, vi } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import FlowNode from "./flowNode.js";
import DataSource from "./sources/dataSource.js";
import { registerLazyDataSource } from "./sources/dataSourceFactory.js";
import {
    resolveEmbedParam,
    resolveScopedEmbedParam,
} from "../paramRuntime/embedParamApi.js";

/** @returns {import("../spec/root.js").RootSpec} */
function example() {
    return JSON.parse(
        readFileSync(
            new URL(
                "../../../../examples/docs/grammar/transform/branch-values.json",
                import.meta.url
            ),
            "utf8"
        )
    );
}

/** @param {import("../spec/root.js").RootSpec} spec */
async function engine(spec) {
    const result = await createHeadlessEngine(spec);
    onTestFinished(() => result.view.disposeSubtree());
    return result;
}

test("an aggregate branch publishes zero and replays its summary without removing main rows", async () => {
    const { view } = await engine({
        params: [{ name: "minimum", value: 4 }],
        data: { sequence: { start: 0, stop: 4 } },
        transform: [
            { type: "collect" },
            {
                type: "branch",
                transform: [
                    { type: "filter", expr: "datum.data >= minimum" },
                    { type: "aggregate" },
                    { type: "values", field: "count", param: "recordCounts" },
                ],
            },
        ],
        mark: {
            type: "text",
            text: { expr: "recordCounts[0] + ' records'" },
        },
    });
    const runtime = view.paramRuntime;
    const mark = /** @type {import("../view/unitView.js").default} */ (view)
        .mark;
    const load = vi.spyOn(view.flowHandle.dataSource, "load");
    const notify = vi.fn();
    onTestFinished(
        resolveScopedEmbedParam(view, "recordCounts").subscribe(notify)
    );
    const empty = runtime.getValue("recordCounts");
    expect(empty).toEqual([0]);
    expect(mark.encoders.text({})).toBe("0 records");

    runtime.setValue("minimum", 5);
    await runtime.whenPropagated();
    expect(runtime.getValue("recordCounts")).toBe(empty);
    expect(notify).not.toHaveBeenCalled();

    runtime.setValue("minimum", 1);
    await runtime.whenPropagated();
    expect(runtime.getValue("recordCounts")).toEqual([3]);
    expect(mark.encoders.text({})).toBe("3 records");
    expect(notify).toHaveBeenCalledOnce();
    expect(load).not.toHaveBeenCalled();
    expect(
        Array.from(view.flowHandle.collector.getData(), (row) => row.data)
    ).toEqual([0, 1, 2, 3]);
});

test("summary replay changes gaps while preserving main rows and equal output identity", async () => {
    const spec = example();
    // An earlier ordinary declaration must resolve the producer-owned output.
    spec.params.unshift({ name: "cutCount", expr: "length(cuts)" });
    const { view } = await engine(spec);
    const runtime = view.paramRuntime;
    const api = resolveScopedEmbedParam(view, "cuts");
    const notify = vi.fn();
    onTestFinished(api.subscribe(notify));
    const load = vi.spyOn(view.flowHandle.dataSource, "load");
    const scale = /** @type {import("../genome/scaleIndex.js").ScaleIndex} */ (
        view.getScaleResolution("x").getScale()
    );

    expect(api.getValue()).toEqual([2, 4]);
    expect(scale.gapPositions()).toEqual([2, 4]);
    const initial = runtime.getValue("cuts");
    runtime.setValue("minimumStrength", 0.1);
    await runtime.whenPropagated();
    expect(runtime.getValue("cuts")).toBe(initial);
    expect(notify).not.toHaveBeenCalled();

    runtime.setValue("minimumStrength", 0.5);
    await runtime.whenPropagated();
    expect(scale.gapPositions()).toEqual([4]);
    expect(runtime.getValue("cutCount")).toBe(1);
    expect(notify).toHaveBeenCalledOnce();
    expect(load).not.toHaveBeenCalled();
    const rows = Array.from(view.flowHandle.collector.getData());
    expect(rows).toHaveLength(18);
    expect(rows.every((row) => !("previousCluster" in row))).toBe(true);

    runtime.setValue("minimumStrength", 1);
    await runtime.whenPropagated();
    expect(scale.gapPositions()).toEqual([]);
    for (const readOnlyApi of [api, resolveEmbedParam(view, "cuts")]) {
        expect(() => readOnlyApi.setValue(/** @type {any} */ ([1]))).toThrow(
            "computed parameter"
        );
    }
    expect(() => runtime.setValue("cuts", [1])).toThrow();
});

test("a root-owned branch updates child scales and is pruned on disposal", async () => {
    const { view, context } = await engine({
        datasets: { metadata: [{ cut: 2 }, { cut: 4 }] },
        data: { name: "metadata" },
        transform: [
            {
                type: "branch",
                transform: [{ type: "values", field: "cut", param: "cuts" }],
            },
        ],
        hconcat: [0, 1].map(
            (x) =>
                /** @type {import("../spec/view.js").UnitSpec} */ ({
                    data: { values: [{ x }] },
                    mark: "point",
                    encoding: {
                        x: {
                            field: "x",
                            type: "index",
                            scale: {
                                domain: [0, 5],
                                gapPositions: { expr: "cuts" },
                                gapWidth: 8,
                            },
                            axis: null,
                        },
                    },
                })
        ),
    });
    expect(view.paramRuntime.getValue("cuts")).toEqual([2, 4]);
    context.dataFlow.updateNamedDataBinding(
        view.namedDataScope.getLocalBinding("metadata"),
        [{ cut: 3 }]
    );
    await view.paramRuntime.whenPropagated();
    const children = /** @type {import("../view/concatView.js").default} */ (
        view
    ).children;
    for (const child of children) {
        expect(
            /** @type {import("../genome/scaleIndex.js").ScaleIndex} */ (
                child.getScaleResolution("x").getScale()
            ).gapPositions()
        ).toEqual([3]);
    }
    view.disposeSubtree();
    expect(context.dataFlow.dataSources).toHaveLength(0);
});

test("disposing a composition endpoint preserves sibling consumers of a merged source", async () => {
    const { view, context } = await engine({
        datasets: { shared: [{ x: 1 }] },
        hconcat: [0, 1].map(() => ({
            data: { name: "shared" },
            layer: [{ mark: "point" }],
        })),
    });
    const [left, right] =
        /** @type {import("../view/concatView.js").default} */ (view).children;
    const source = right.flowHandle.dataSource;
    left.disposeSubtree();
    expect(source.disposed).toBe(false);
    context.dataFlow.updateNamedDataBinding(
        view.namedDataScope.getLocalBinding("shared"),
        [{ x: 2 }]
    );
    const unit = /** @type {import("../view/layerView.js").default} */ (right)
        .children[0];
    expect(
        Array.from(unit.flowHandle.collector.getData(), (row) => row.x)
    ).toEqual([2]);
});

test("duplicate output declarations are rejected", async () => {
    await expect(
        createHeadlessEngine({
            params: [{ name: "cuts", value: [] }],
            data: { values: [{ x: 1 }] },
            transform: [{ type: "values", field: "x", param: "cuts" }],
            mark: "point",
        })
    ).rejects.toThrow(/already|Duplicate/);
});

test("custom sources publish successful completion without feature-specific configuration", async () => {
    class SnapshotSource extends DataSource {
        /** @param {object} _params @param {import("../view/view.js").default} view */
        constructor(_params, view) {
            super(view);
        }

        async load() {
            this.reset();
            this.beginBatch({ type: "file" });
            this._propagate({ x: 2 });
            this.complete();
        }
    }

    onTestFinished(
        registerLazyDataSource(
            (params) => /** @type {any} */ (params).type === "snapshotTest",
            SnapshotSource
        )
    );
    const { view } = await engine({
        data: { lazy: /** @type {any} */ ({ type: "snapshotTest" }) },
        transform: [{ type: "values", field: "x", param: "positions" }],
        mark: "point",
    });
    const source = view.flowHandle.dataSource;
    const initial = view.paramRuntime.getValue("positions");
    expect(initial).toEqual([2]);

    source.reset();
    source.complete(false);
    expect(view.paramRuntime.getValue("positions")).toBe(initial);
});

test("a named-data output updates a separate pipeline's filter", async () => {
    const { view, context } = await engine({
        datasets: {
            thresholds: [{ minimum: 2 }],
            records: [{ x: 1 }, { x: 3 }],
        },
        data: { name: "thresholds" },
        transform: [{ type: "values", field: "minimum", param: "minimums" }],
        layer: [
            {
                data: { name: "records" },
                transform: [
                    { type: "collect" },
                    { type: "filter", expr: "datum.x >= minimums[0]" },
                ],
                mark: "point",
            },
        ],
    });
    const child = /** @type {import("../view/layerView.js").default} */ (view)
        .children[0];
    const runtime = view.paramRuntime;
    const rows = () =>
        Array.from(child.flowHandle.collector.getData(), (row) => row.x);

    await runtime.whenPropagated();
    expect(rows()).toEqual([3]);

    context.dataFlow.updateNamedDataBinding(
        view.namedDataScope.getLocalBinding("thresholds"),
        [{ minimum: 4 }]
    );
    await runtime.whenPropagated();
    expect(rows()).toEqual([]);

    context.dataFlow.updateNamedDataBinding(
        view.namedDataScope.getLocalBinding("records"),
        [{ x: 3 }, { x: 5 }]
    );
    await runtime.whenPropagated();
    expect(rows()).toEqual([5]);
});

test("failed URL revisions retain the previous output and disposed loads cannot publish", async () => {
    const fetch = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify([{ x: 1 }, { x: 2 }])));
    vi.stubGlobal("fetch", fetch);
    onTestFinished(() => {
        vi.unstubAllGlobals();
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    onTestFinished(() => {
        vi.restoreAllMocks();
    });
    const { view } = await engine({
        params: [{ name: "minimum", value: 0 }],
        data: { url: "metadata.json" },
        transform: [
            { type: "collect" },
            { type: "filter", expr: "datum.x >= minimum" },
            { type: "values", field: "x", param: "cuts" },
        ],
        mark: "point",
    });
    const source = view.flowHandle.dataSource;
    const output = view.paramRuntime.getOutput("cuts");
    const initial = view.paramRuntime.getValue("cuts");
    const notify = vi.fn();
    onTestFinished(resolveScopedEmbedParam(view, "cuts").subscribe(notify));
    fetch.mockResolvedValue(new Response(JSON.stringify([{ x: 3 }, {}])));
    await source.load();
    expect(view.paramRuntime.getValue("cuts")).toBe(initial);
    expect(notify).not.toHaveBeenCalled();

    fetch.mockResolvedValue(new Response("unavailable", { status: 503 }));
    await source.load();
    view.paramRuntime.setValue("minimum", 1);
    await view.paramRuntime.whenPropagated();
    expect(view.paramRuntime.getValue("cuts")).toBe(initial);
    expect(notify).not.toHaveBeenCalled();

    // A later sibling fails after this producer stages a complete candidate.
    class CompletionFailure extends FlowNode {
        complete() {
            throw new Error("late completion failure");
        }
    }
    source.addChild(new CompletionFailure());
    fetch.mockResolvedValue(new Response(JSON.stringify([{ x: 3 }])));
    await source.load();
    expect(view.paramRuntime.getValue("cuts")).toBe(initial);
    expect(notify).not.toHaveBeenCalled();

    /** @type {(response: Response) => void} */
    let finish;
    fetch.mockImplementation(
        () => new Promise((resolve) => (finish = resolve))
    );
    const pending = source.load();
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    view.disposeSubtree();
    finish(new Response(JSON.stringify([{ x: 9 }])));
    await pending;
    expect(output.value.get()).toBe(initial);
    expect(notify).not.toHaveBeenCalled();
});
