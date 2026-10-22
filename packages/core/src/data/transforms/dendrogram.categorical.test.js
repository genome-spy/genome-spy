import { expect, onTestFinished, test, vi } from "vitest";
import DendrogramTransform from "./dendrogram.js";
import { processData } from "../flowTestUtils.js";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";

const fields = {
    type: /** @type {const} */ ("dendrogram"),
    key: "id",
    parentKey: "parent",
    height: "height",
    leaf: "label",
};
/** @type {import("../../spec/transform.js").SiblingOrderedDendrogramParams} */
const params = { ...fields, siblingOrder: "order" };

/** @returns {import("../flowNode.js").Datum[]} */
function tree() {
    // Shuffled rows deliberately differ from structural leaf order.
    return [
        { id: "C", parent: "ABC", height: 0, label: "C", order: 1 },
        { id: "root", parent: null, height: 3 },
        { id: "B", parent: "AB", height: 0, label: "B", order: 1 },
        { id: "AB", parent: "ABC", height: 1, order: 0 },
        { id: "D", parent: "root", height: 0, label: "D", order: 1 },
        { id: "A", parent: "AB", height: 0, label: "A", order: 0 },
        { id: "ABC", parent: "root", height: 2, order: 0 },
    ];
}

test("categorical anchors retain child midpoint fractions and structural order", () => {
    const rows = tree();
    const original = structuredClone(rows);
    const edges = processData(new DendrogramTransform(params), rows);
    const edge = edges.find((edge) => edge.targetId === "ABC");
    expect(edge).toMatchObject({
        sourceValue: "C",
        sourceOffset: 0.125,
        targetValue: "B",
        targetOffset: 0.25,
    });
    expect(rows).toEqual(original);
    expect(edges.map((edge) => edge.targetId)).toEqual(
        rows.filter((row) => row.parent !== null).map((row) => row.id)
    );
});

test("supports typed categories, unary and multifurcating trees, and custom fields", () => {
    /** @type {import("../flowNode.js").Datum[]} */
    const rows = [
        { id: "root", parent: null, height: 3 },
        { id: "unary", parent: "root", height: 1, order: 0 },
        { id: "a", parent: "unary", height: 0, order: 0, label: 1 },
        { id: "b", parent: "root", height: 0, order: 1, label: "1" },
        { id: "c", parent: "root", height: 0, order: 2, label: false },
    ];
    const edges = processData(
        new DendrogramTransform({
            ...params,
            as: ["s", "t", "sh", "th", "sv", "tv", "sf", "tf"],
        }),
        rows
    );
    expect(edges.map((edge) => edge.tv)).toEqual([1, 1, "1", false]);
});

test("explicit leafOrder reserves extra band slots without treating them as tree leaves", () => {
    const edges = processData(
        new DendrogramTransform({
            ...fields,
            leafOrder: ["A", "unused", "B", "C", "D"],
        }),
        tree()
    );
    expect(edges.find((edge) => edge.targetId === "A")).toMatchObject({
        sourceValue: "unused",
        sourceOffset: 0,
        targetValue: "A",
    });
    expect(() =>
        processData(
            new DendrogramTransform({
                ...fields,
                leafOrder: ["A", "C", "B", "D"],
            }),
            tree()
        )
    ).toThrow("Incompatible dendrogram leaf order");
});

/** @type {[string, (rows: import("../flowNode.js").Datum[]) => void, RegExp][]} */
const invalidCases = [
    ["duplicate category", (rows) => (rows[0].label = "A"), /categories/],
    ["non-scalar category", (rows) => (rows[0].label = null), /categories/],
    ["non-finite category", (rows) => (rows[0].label = Infinity), /categories/],
    ["duplicate sibling rank", (rows) => (rows[0].order = 0), /sibling order/],
    ["missing internal rank", (rows) => delete rows[3].order, /Invalid field/],
];
test.each(invalidCases)("rejects %s", (_name, mutate, message) => {
    const rows = tree();
    mutate(rows);
    expect(() => processData(new DendrogramTransform(params), rows)).toThrow(
        message
    );
});

test("explicit orders must be unique complete scalar arrays", () => {
    for (const leafOrder of [
        ["A", "A", "C", "D"],
        ["A", "B"],
        ["A", "B", "C", Infinity],
    ]) {
        expect(() =>
            processData(
                new DendrogramTransform({
                    ...fields,
                    leafOrder,
                }),
                tree()
            )
        ).toThrow();
    }
    expect(
        () =>
            new DendrogramTransform(
                /** @type {any} */ ({ ...params, leafOrder: [] })
            )
    ).toThrow("exactly one");
    expect(
        () =>
            new DendrogramTransform(
                /** @type {any} */ ({ ...params, leafIndex: "row" })
            )
    ).toThrow("without leafIndex");
});

test("publication, cached replay, failures, and zero-edge trees follow the real source boundary", async () => {
    const { view, context } = await createHeadlessEngine({
        datasets: { tree: tree() },
        data: { name: "tree" },
        transform: [{ ...params, domainParam: "order" }],
        mark: "link",
        encoding: {
            y: {
                field: "sourceValue",
                type: "nominal",
                scale: { type: "band", domain: { expr: "order" } },
            },
            y2: { field: "targetValue" },
        },
    });
    onTestFinished(() => view.disposeSubtree());
    const runtime = view.paramRuntime;
    const initial = runtime.getValue("order");
    expect(initial).toEqual(["A", "B", "C", "D"]);
    expect(Object.isFrozen(initial)).toBe(true);
    const notify = vi.fn();
    onTestFinished(runtime.createExpression("order").subscribe(notify));
    const update = (/** @type {any[]} */ rows) =>
        context.dataFlow.updateNamedDataBinding(
            view.namedDataScope.getLocalBinding("tree"),
            rows
        );
    update(tree());
    await runtime.whenPropagated();
    expect(runtime.getValue("order")).toBe(initial);
    expect(notify).not.toHaveBeenCalled();
    const changed = tree();
    for (const node of changed)
        if (node.parent === "AB") node.order = 1 - node.order;
    update(changed);
    await runtime.whenPropagated();
    expect(view.getScaleResolution("y").getScale().domain()).toEqual([
        "B",
        "A",
        "C",
        "D",
    ]);
    const lastGood = runtime.getValue("order");
    const bad = tree();
    bad[0].label = "A";
    expect(() => update(bad)).toThrow(/categories/);
    expect(runtime.getValue("order")).toBe(lastGood);
    expect(runtime.getOutput("order").ready).toBe(false);
    update([{ id: "only", parent: null, height: 0, label: true }]);
    expect(runtime.getValue("order")).toEqual([true]);
    expect(view.flowHandle.collector.getItemCount()).toBe(0);
    update([]);
    expect(runtime.getValue("order")).toEqual([]);
});

test("ordinary parameter leaf orders replay, while output-driven ordering is rejected", async () => {
    const spec = /** @type {import("../../spec/root.js").RootSpec} */ ({
        params: [{ name: "desired", value: ["A", "B", "C", "D"] }],
        data: { values: tree() },
        transform: [
            {
                ...fields,
                leafOrder: { expr: "desired" },
                domainParam: "order",
            },
        ],
        mark: "point",
    });
    const { view } = await createHeadlessEngine(spec);
    onTestFinished(() => view.disposeSubtree());
    view.paramRuntime.setValue("desired", ["B", "A", "C", "D"]);
    await view.paramRuntime.whenPropagated();
    expect(view.paramRuntime.getValue("order")).toEqual(["B", "A", "C", "D"]);
    /** @type {import("../../spec/transform.js").ExplicitlyOrderedDendrogramParams} */ (
        spec.transform[0]
    ).leafOrder = { expr: "order" };
    await expect(createHeadlessEngine(spec)).rejects.toThrow(
        /cannot consume transform output/
    );
});

test("publishing rejects multiple file trees and facets instead of publishing a partition", async () => {
    const { view } = await createHeadlessEngine({
        data: { values: tree() },
        transform: [{ ...params, domainParam: "order" }],
        mark: "point",
    });
    onTestFinished(() => view.disposeSubtree());
    const transform = view.paramRuntime.getOutput("order").producer;
    transform.reset();
    expect(() => transform.beginBatch({ type: "facet", facetId: [1] })).toThrow(
        /facets/
    );
    transform.beginBatch({ type: "file", url: "first" });
    for (const row of tree()) transform.handle(row);
    transform.beginBatch({ type: "file", url: "second" });
    for (const row of tree()) transform.handle(row);
    expect(() => transform.complete()).toThrow(/one tree/);
});
