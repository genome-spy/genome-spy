import { readFileSync } from "node:fs";
import { expect, onTestFinished, test, vi } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import FlowNode from "./flowNode.js";
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

test("summary replay changes gaps while preserving main rows and equal output identity", async () => {
    const spec = example();
    // An earlier ordinary declaration must resolve the producer-owned output.
    spec.params.unshift({ name: "cutCount", expr: "length(cuts)" });
    const { view } = await engine(spec);
    const runtime = view.paramRuntime;
    const output = runtime.getOutput("cuts");
    const api = resolveScopedEmbedParam(view, "cuts");
    const notify = vi.fn();
    onTestFinished(api.subscribe(notify));
    const load = vi.spyOn(view.flowHandle.dataSource, "load");
    const scale = /** @type {import("../genome/scaleIndex.js").ScaleIndex} */ (
        view.getScaleResolution("x").getScale()
    );

    expect(api.getValue()).toEqual([2, 4]);
    expect(output.ready).toBe(true);
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
    expect(output.ready).toBe(true);
    for (const readOnlyApi of [api, resolveEmbedParam(view, "cuts")]) {
        expect(() => readOnlyApi.setValue(/** @type {any} */ ([1]))).toThrow(
            "computed parameter"
        );
    }
    expect(() => runtime.setValue("cuts", [1])).toThrow();
});

test("root-owned independent metadata is visible across children and is pruned on disposal", async () => {
    const { view, context } = await engine({
        datasets: { metadata: [{ cut: 2 }, { cut: 4 }] },
        transform: [
            {
                type: "branch",
                data: { name: "metadata" },
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

test.each([
    {
        expr: "bandwidth('x') > 0",
        scale: { domain: [0, 5], gapPositions: { expr: "cuts" }, gapWidth: 8 },
    },
    { expr: "domain('x')[0] >= 0", scale: { domain: { expr: "cuts" } } },
])(
    "rejects indirect scale-helper flow consumers: $expr",
    async ({ expr, scale }) => {
        await expect(
            createHeadlessEngine({
                data: { values: [{ x: 1 }, { x: 2 }] },
                transform: [
                    { type: "filter", expr },
                    { type: "values", field: "x", param: "cuts" },
                ],
                mark: "point",
                encoding: {
                    x: { field: "x", type: "index", scale, axis: null },
                },
            })
        ).rejects.toThrow('cannot consume transform output parameter "cuts"');
    }
);

test.each([
    { name: "direct", expr: "length(cuts) > 0", params: [] },
    {
        name: "computed",
        expr: "derived > 0",
        params: [{ name: "derived", expr: "length(cuts)" }],
    },
    {
        name: "debounced",
        expr: "derived > 0",
        params: [{ name: "derived", expr: "length(cuts)", debounce: 10 }],
    },
    {
        name: "transitioned",
        expr: "derived > 0",
        params: [
            {
                name: "derived",
                expr: "length(cuts)",
                transition: { type: "lerp" },
            },
        ],
    },
])("rejects $name flow consumers before loading", async ({ expr, params }) => {
    await expect(
        createHeadlessEngine({
            params: /** @type {import("../spec/parameter.js").Parameter[]} */ (
                params
            ),
            data: { values: [{ x: 1 }] },
            transform: [
                { type: "filter", expr },
                { type: "values", field: "x", param: "cuts" },
            ],
            mark: "point",
        })
    ).rejects.toThrow('cannot consume transform output parameter "cuts"');
});

test("rejects output feedback through a child's composition size", async () => {
    await expect(
        createHeadlessEngine({
            transform: [
                {
                    type: "branch",
                    data: { values: [{ x: 1 }, { x: 2 }] },
                    transform: [
                        { type: "filter", expr: "datum.x < width" },
                        { type: "values", field: "x", param: "cuts" },
                    ],
                },
            ],
            hconcat: [
                {
                    width: { expr: "100 + length(cuts) * 10" },
                    data: { values: [{ x: 1 }] },
                    mark: "point",
                },
            ],
        })
    ).rejects.toThrow('cannot consume transform output parameter "cuts"');
});

test("rejects output-dependent sources and duplicate declarations", async () => {
    const spec = /** @type {import("../spec/root.js").RootSpec} */ ({
        data: { url: { expr: "cuts[0]" }, format: { type: "json" } },
        transform: [{ type: "values", field: "x", param: "cuts" }],
        mark: "point",
    });
    await expect(createHeadlessEngine(spec)).rejects.toThrow(
        'cannot consume transform output parameter "cuts"'
    );
    spec.data = { values: [{ x: 1 }] };
    spec.params = [{ name: "cuts", value: [] }];
    await expect(createHeadlessEngine(spec)).rejects.toThrow(
        /already|Duplicate/
    );
});

test("flow guards validate bound identities and future operation inputs", async () => {
    const { view } = await engine({
        data: { values: [{ x: 1 }] },
        transform: [{ type: "values", field: "x", param: "cuts" }],
        hconcat: [
            {
                params: [{ name: "cuts", value: 1 }],
                data: { values: [{ x: 0 }, { x: 2 }] },
                transform: [{ type: "filter", expr: "datum.x > cuts" }],
                mark: "point",
            },
        ],
    });
    const child = /** @type {import("../view/concatView.js").default} */ (view)
        .children[0];
    expect(
        Array.from(child.flowHandle.collector.getData(), (row) => row.x)
    ).toEqual([2]);
    const runtime = view.paramRuntime;
    const input = runtime.signal("input", 1);
    const operation = runtime.operation(
        "bridge",
        [input],
        () => input.get(),
        () => {}
    );
    const stop = runtime.guardFlowDependencies([operation]);
    onTestFinished(() => {
        stop();
    });
    const cuts = runtime.getParamRef("cuts");
    expect(() => operation.rebind([cuts], () => 0)).toThrow(
        "cannot consume transform output"
    );
    expect(() => runtime.setValidationDependencies(operation, [cuts])).toThrow(
        "cannot consume transform output"
    );
    input.set(2);
    await runtime.whenPropagated();
    expect(operation.get()).toBe(2);
});

test.each([
    { expr: "100 + length(cuts) * 10" },
    { step: { expr: "length(cuts) + 1" } },
])(
    "rejects output feedback through implicit layout width: %j",
    async (width) => {
        await expect(
            createHeadlessEngine({
                width,
                data: { values: [{ x: 1 }, { x: 2 }] },
                transform: [
                    { type: "filter", expr: "datum.x < width" },
                    { type: "values", field: "x", param: "cuts" },
                ],
                mark: "point",
                encoding: { x: { field: "x", type: "index", axis: null } },
            })
        ).rejects.toThrow('cannot consume transform output parameter "cuts"');
    }
);

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
    const revision = output.revision;
    fetch.mockResolvedValue(new Response(JSON.stringify([{ x: 3 }, {}])));
    await source.load();
    expect(view.paramRuntime.getValue("cuts")).toBe(initial);
    expect(output.revision).toBe(revision);
    expect(output.ready).toBe(false);

    fetch.mockResolvedValue(new Response("unavailable", { status: 503 }));
    await source.load();
    view.paramRuntime.setValue("minimum", 1);
    await view.paramRuntime.whenPropagated();
    expect(view.paramRuntime.getValue("cuts")).toBe(initial);
    expect(output.ready).toBe(false);
    expect(output.revision).toBe(revision);

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
    expect(output.revision).toBe(revision);

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
    expect(output.revision).toBe(revision);
});
