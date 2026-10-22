import { expect, onTestFinished, test, vi } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { resolveScopedEmbedParam } from "../paramRuntime/embedParamApi.js";
import { initializeVisibleViewData } from "../genomeSpy/viewDataInit.js";

/** @returns {import("../spec/root.js").RootSpec} */
function specification() {
    return {
        params: [
            { name: "sampleOrder" },
            { name: "geneOrder" },
            {
                name: "sampleCount",
                expr: "sampleOrder ? length(sampleOrder) : 0",
            },
        ],
        datasets: {
            samples: [{ id: "B" }, { id: "A" }],
            genes: [{ id: "G2" }, { id: "G1" }],
        },
        resolve: { scale: { x: "excluded", y: "excluded" } },
        scales: {
            x: { type: "band", domain: { expr: "geneOrder" } },
            y: { type: "band", domain: { expr: "sampleOrder" } },
        },
        spec: {
            name: "matrix",
            data: { values: [{ sample: "A", gene: "G1" }] },
            mark: {
                type: "rect",
                opacity: { expr: "sampleCount > 0 ? 1 : 0" },
            },
            encoding: {
                x: { field: "gene", type: "nominal" },
                y: { field: "sample", type: "nominal" },
            },
        },
        surround: {
            top: [
                {
                    name: "genes",
                    data: { name: "genes" },
                    transform: [
                        {
                            type: "values",
                            field: "id",
                            param: { name: "geneOrder", push: "outer" },
                        },
                    ],
                    mark: "point",
                    encoding: { x: { field: "id", type: "nominal" } },
                },
            ],
            left: [
                {
                    name: "samples",
                    visible: false,
                    title: "Samples",
                    data: { name: "samples" },
                    transform: [
                        {
                            type: "values",
                            field: "id",
                            param: { name: "sampleOrder", push: "outer" },
                        },
                    ],
                    mark: "point",
                    encoding: { y: { field: "id", type: "nominal" } },
                },
            ],
            right: [
                {
                    name: "unrelated",
                    visible: false,
                    data: { values: [{ id: 0 }] },
                    mark: "point",
                },
            ],
        },
    };
}

test("two side producers drive shared bands through outer outputs, including a hidden tree", async () => {
    const { view, context } = await createHeadlessEngine(specification(), {
        contextOptions: {
            isViewConfiguredVisible: (view) => view.isVisibleInSpec(),
        },
    });
    onTestFinished(() => view.disposeSubtree());
    const find = (/** @type {string} */ name) =>
        view.getDescendants().find((v) => v.name === name);
    const matrix = find("matrix");
    const producer = find("samples");
    expect(view.paramRuntime.getValue("sampleCount")).toBe(2);
    expect(matrix.getScaleResolution("y").getScale().domain()).toEqual([
        "B",
        "A",
    ]);
    expect(matrix.getScaleResolution("x").getScale().domain()).toEqual([
        "G2",
        "G1",
    ]);
    expect(producer.getDataInitializationState()).toBe("ready");
    expect(find("unrelated").flowHandle).toBeUndefined();
    const handle = producer.flowHandle;
    producer.spec.visible = true;
    await initializeVisibleViewData(
        view,
        context.dataFlow,
        context.textMetrics
    );
    expect(producer.flowHandle).toBe(handle);
    context.dataFlow.updateNamedDataBinding(
        view.namedDataScope.getLocalBinding("samples"),
        [{ id: "A" }, { id: "B" }]
    );
    await view.paramRuntime.whenPropagated();
    expect(matrix.getScaleResolution("y").getScale().domain()).toEqual([
        "A",
        "B",
    ]);
    expect(() =>
        resolveScopedEmbedParam(view, "sampleOrder").setValue(
            /** @type {any} */ ([])
        )
    ).toThrow("computed parameter");
    expect(() => producer.disposeSubtree()).toThrow("owner survives");
    const parent = /** @type {import("../view/concatView.js").default} */ (
        producer.layoutParent
    );
    await expect(
        parent.removeChildAt(parent.children.indexOf(producer))
    ).rejects.toThrow("owner survives");
    expect(parent.children).toContain(producer);
    expect(matrix.getScaleResolution("y").getScale().domain()).toEqual([
        "A",
        "B",
    ]);
    view.disposeSubtree();
    expect(context.dataFlow.dataSources).toHaveLength(0);
});

test.each([
    [{ name: "sampleOrder", value: [] }, "bare parameter"],
    [{ name: "sampleOrder", expr: "[]" }, "bare parameter"],
    [undefined, "not found in outer scope"],
])(
    "pushing requires an existing bare ancestor parameter",
    async (replacement, message) => {
        const spec = specification();
        spec.params = spec.params.filter(
            (p) => p.name !== "sampleOrder" && p.name !== "sampleCount"
        );
        if (replacement) spec.params.push(replacement);
        await expect(createHeadlessEngine(spec)).rejects.toThrow(message);
    }
);

test("rejects duplicate output writers before loading", async () => {
    const spec = specification();
    const surround = /** @type {import("../spec/view.js").SurroundSpec} */ (
        spec
    );
    const left = /** @type {import("../spec/view.js").UnitSpec[]} */ (
        surround.surround.left
    );
    left.push(structuredClone(left[0]));
    await expect(createHeadlessEngine(spec)).rejects.toThrow(
        "Duplicate transform output producer"
    );
});

test("outer output provenance rejects indirect flow feedback", async () => {
    const spec = specification();
    const surround = /** @type {import("../spec/view.js").SurroundSpec} */ (
        spec
    );
    const left = /** @type {import("../spec/view.js").UnitSpec[]} */ (
        surround.surround.left
    );
    left[0].transform.unshift({
        type: "filter",
        expr: "sampleCount > 0",
    });
    await expect(createHeadlessEngine(spec)).rejects.toThrow(/output/i);
});

test("named template instances own independent pushed outputs", async () => {
    const { view, context } = await createHeadlessEngine({
        templates: {
            panel: {
                params: [{ name: "order" }],
                datasets: { rows: [{ id: "A" }] },
                hconcat: [
                    {
                        data: { name: "rows" },
                        transform: [
                            {
                                type: "values",
                                field: "id",
                                param: { name: "order", push: "outer" },
                            },
                        ],
                        mark: "point",
                    },
                ],
            },
        },
        vconcat: [
            { name: "first", import: { template: "panel" } },
            { name: "second", import: { template: "panel" } },
        ],
    });
    onTestFinished(() => view.disposeSubtree());
    const [first, second] =
        /** @type {import("../view/concatView.js").default} */ (view).children;
    context.dataFlow.updateNamedDataBinding(
        first.namedDataScope.getLocalBinding("rows"),
        [{ id: "B" }]
    );
    await view.paramRuntime.whenPropagated();
    expect(first.paramRuntime.getValue("order")).toEqual(["B"]);
    expect(second.paramRuntime.getValue("order")).toEqual(["A"]);
});

test("dynamic insertion requires the output owner and producer to be created together", async () => {
    const { view, context } = await createHeadlessEngine({
        params: [{ name: "unbound" }],
        hconcat: [{ data: { values: [{ x: 1 }] }, mark: "point" }],
    });
    onTestFinished(() => view.disposeSubtree());
    const container = /** @type {import("../view/concatView.js").default} */ (
        view
    );
    const before = container.children;
    const sources = context.dataFlow.dataSources.length;
    await expect(
        container.addChildSpec({
            data: { values: [] },
            transform: [
                {
                    type: "values",
                    field: "id",
                    param: { name: "unbound", push: "outer" },
                },
            ],
            mark: "point",
        })
    ).rejects.toThrow("configured ancestor");
    expect(container.children).toEqual(before);
    expect(context.dataFlow.dataSources).toHaveLength(sources);
    expect(view.paramRuntime.getValue("unbound")).toBeNull();
    expect(view.paramRuntime.isWritable("unbound")).toBe(true);
    const valid = await container.addChildSpec({
        params: [{ name: "order" }],
        hconcat: [
            {
                data: { values: [{ id: "B" }, { id: "A" }] },
                transform: [
                    {
                        type: "values",
                        field: "id",
                        param: { name: "order", push: "outer" },
                    },
                ],
                mark: "point",
            },
        ],
    });
    expect(valid.paramRuntime.getValue("order")).toEqual(["B", "A"]);
});

test.each([false, true])(
    "dynamic publishers load independent branch endpoints, branch-only=%s",
    async (branchOnly) => {
        const { view } = await createHeadlessEngine({
            ...(branchOnly ? {} : { data: { values: [{ id: "main" }] } }),
            hconcat: [{ data: { values: [] }, mark: "point" }],
        });
        onTestFinished(() => view.disposeSubtree());
        const inserted =
            await /** @type {import("../view/concatView.js").default} */ (
                view
            ).addChildSpec({
                params: [{ name: "order" }],
                hconcat: [
                    {
                        ...(branchOnly
                            ? { layer: [] }
                            : { mark: /** @type {const} */ ("point") }),
                        transform: [
                            {
                                type: "branch",
                                data: { values: [{ id: "B" }, { id: "A" }] },
                                transform: [
                                    {
                                        type: "values",
                                        field: "id",
                                        param: { name: "order", push: "outer" },
                                    },
                                ],
                            },
                        ],
                    },
                ],
            });
        expect(inserted.paramRuntime.getValue("order")).toEqual(["B", "A"]);
        expect(inserted.paramRuntime.getOutput("order").ready).toBe(true);
    }
);

test("an independent publisher loads while inherited main data replays without a reload", async () => {
    const { view, context } = await createHeadlessEngine({
        hconcat: [
            { name: "base", data: { values: [{ id: "main" }] }, mark: "point" },
        ],
    });
    onTestFinished(() => view.disposeSubtree());
    const parent = /** @type {import("../view/concatView.js").default} */ (
        view
    );
    const base = parent.children[0];
    const load = vi.spyOn(base.flowHandle.dataSource, "load");
    const child = await context.createOrImportView(
        {
            transform: [
                {
                    type: "branch",
                    data: { values: [{ id: "B" }, { id: "A" }] },
                    transform: [
                        { type: "values", field: "id", param: "order" },
                    ],
                },
            ],
            mark: "point",
        },
        parent,
        base,
        "summary"
    );
    parent.appendChildView(child);
    await initializeVisibleViewData(
        view,
        context.dataFlow,
        context.textMetrics
    );
    expect(child.paramRuntime.getValue("order")).toEqual(["B", "A"]);
    expect(
        Array.from(child.flowHandle.collector.getData(), (row) => row.id)
    ).toEqual(["main"]);
    expect(load).not.toHaveBeenCalled();
});
