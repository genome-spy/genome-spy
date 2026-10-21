import { expect, onTestFinished, test } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { resolveScopedEmbedParam } from "../paramRuntime/embedParamApi.js";
import { initializeVisibleViewData } from "../genomeSpy/viewDataInit.js";

/** @returns {import("../spec/root.js").RootSpec} */
function specification() {
    return {
        params: [
            { name: "sampleCount", expr: "length(sampleOrder)" },
            { name: "sampleOrder", output: /** @type {const} */ (true) },
            { name: "geneOrder", output: /** @type {const} */ (true) },
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
    [{ name: "sampleOrder", value: [] }, "not declared"],
    [{ name: "sampleOrder", expr: "[]" }, "not declared"],
    [undefined, "not found in outer scope"],
])(
    "pushing requires an existing read-only ancestor output",
    async (replacement, message) => {
        const spec = specification();
        spec.params = spec.params.filter(
            (p) => p.name !== "sampleOrder" && p.name !== "sampleCount"
        );
        if (replacement) spec.params.push(replacement);
        await expect(createHeadlessEngine(spec)).rejects.toThrow(message);
    }
);

test("rejects outputs without producers and duplicate writers before loading", async () => {
    await expect(
        createHeadlessEngine({
            params: [{ name: "unused", output: /** @type {const} */ (true) }],
            mark: "point",
        })
    ).rejects.toThrow("no producer");
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
