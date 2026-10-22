import { expect, onTestFinished, test, vi } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { resolveScopedEmbedParam } from "../../paramRuntime/embedParamApi.js";

test("count starts unknown, publishes empty and populated totals, and drives text", async () => {
    const { view, context } = await createHeadlessEngine(
        {
            datasets: { rows: [] },
            data: { name: "rows" },
            transform: [{ type: "count", param: "recordCount" }],
            mark: { type: "text", text: { expr: "recordCount + ' records'" } },
        },
        {
            onDataFlowBuilt: (flow) => {
                expect(
                    flow.dataSources[0].view.paramRuntime.getValue(
                        "recordCount"
                    )
                ).toBeNull();
            },
        }
    );
    onTestFinished(() => view.disposeSubtree());
    const runtime = view.paramRuntime;
    const api = resolveScopedEmbedParam(view, "recordCount");
    const notify = vi.fn();
    onTestFinished(api.subscribe(notify));
    const mark = /** @type {import("../../view/unitView.js").default} */ (view)
        .mark;
    const binding = view.namedDataScope.getLocalBinding("rows");

    expect(api.getValue()).toBe(0);
    expect(mark.encoders.text({})).toBe("0 records");
    const rows = [{ id: 1 }, { id: 2 }];
    context.dataFlow.updateNamedDataBinding(binding, rows);
    await runtime.whenPropagated();
    expect(api.getValue()).toBe(2);
    expect(mark.encoders.text({})).toBe("2 records");
    expect(Array.from(view.flowHandle.collector.getData())).toEqual(rows);
    expect(notify).toHaveBeenCalledOnce();

    context.dataFlow.updateNamedDataBinding(binding, [{ id: 3 }, { id: 4 }]);
    await runtime.whenPropagated();
    expect(notify).toHaveBeenCalledOnce();
    expect(runtime.paramConfigs.get("recordCount").persist).toBe(false);
    expect(() => api.setValue(1)).toThrow("computed parameter");
    expect(() => runtime.setValue("recordCount", 1)).toThrow();

    const output = runtime.getOutput("recordCount");
    const revision = output.revision;
    view.disposeSubtree();
    expect(output.producer.disposed).toBe(true);
    expect(output.revision).toBe(revision);
});

test("ordinary parameter replay recomputes count from cached rows without fetching", async () => {
    const { view } = await createHeadlessEngine({
        params: [{ name: "minimum", value: 0 }],
        data: { sequence: { start: 0, stop: 4 } },
        transform: [
            { type: "collect" },
            { type: "filter", expr: "datum.data >= minimum" },
            { type: "count", param: "recordCount" },
        ],
        mark: "point",
    });
    onTestFinished(() => view.disposeSubtree());
    const load = vi.spyOn(view.flowHandle.dataSource, "load");
    expect(view.paramRuntime.getValue("recordCount")).toBe(4);
    view.paramRuntime.setValue("minimum", 4);
    await view.paramRuntime.whenPropagated();
    expect(view.paramRuntime.getValue("recordCount")).toBe(0);
    expect(Array.from(view.flowHandle.collector.getData())).toEqual([]);
    expect(load).not.toHaveBeenCalled();
});

test("file and facet boundaries do not restart the whole-result counter", async () => {
    const { view } = await createHeadlessEngine({
        data: { values: [] },
        transform: [{ type: "count", param: "recordCount" }],
        mark: "point",
    });
    onTestFinished(() => view.disposeSubtree());
    const source = view.flowHandle.dataSource;
    source.reset();
    source.beginBatch({ type: "facet", facetId: ["A"] });
    source.beginBatch({ type: "file", url: "first.json" });
    source.children[0].handle({ id: 1 });
    source.beginBatch({ type: "file", url: "second.json" });
    source.children[0].handle({ id: 2 });
    source.beginBatch({ type: "facet", facetId: ["empty"] });
    source.beginBatch({ type: "file", url: "empty.json" });
    source.beginBatch({ type: "facet", facetId: ["B"] });
    source.children[0].handle({ id: 3 });
    source.complete();
    await view.paramRuntime.whenPropagated();
    expect(view.paramRuntime.getValue("recordCount")).toBe(3);
    expect(Array.from(view.flowHandle.collector.getData())).toHaveLength(3);

    source.reset();
    source.beginBatch({ type: "facet", facetId: ["empty"] });
    source.complete();
    await view.paramRuntime.whenPropagated();
    expect(view.paramRuntime.getValue("recordCount")).toBe(0);
});

test("counts share declaration conflicts and dataflow-consumer guards", async () => {
    const spec = /** @type {import("../../spec/root.js").RootSpec} */ ({
        data: { values: [] },
        transform: [{ type: "count", param: "recordCount" }],
        params: [{ name: "recordCount", value: 0 }],
        mark: "point",
    });
    await expect(createHeadlessEngine(spec)).rejects.toThrow(
        /already|Duplicate/
    );
    spec.params = [];
    spec.transform.unshift({ type: "filter", expr: "recordCount === 0" });
    await expect(createHeadlessEngine(spec)).rejects.toThrow(
        'cannot consume transform output parameter "recordCount"'
    );
});
