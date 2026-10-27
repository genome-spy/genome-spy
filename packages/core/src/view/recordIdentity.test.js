import { expect, test } from "vitest";
import { createTestEmbed, getPointSelection } from "./embedTestUtils.js";
import IdentifierTransform, {
    UNIQUE_ID_KEY,
} from "../data/transforms/identifier.js";
import { isInChromeSubtree } from "./viewChrome.js";
import UnitView from "./unitView.js";
import { initializeVisibleViewData } from "../genomeSpy/viewDataInit.js";

/** @param {import("./view.js").default} root */
function units(root) {
    return root.getDescendants().filter((view) => view instanceof UnitView);
}

test.each([false, true])(
    "preserves record membership without picking (explicit undefined projection: %s)",
    async (explicitUndefined) => {
        const { views } = await createTestEmbed({
            params: [
                {
                    name: "selected",
                    select: {
                        type: "point",
                        ...(explicitUndefined ? { encodings: undefined } : {}),
                    },
                },
            ],
            vconcat: [
                {
                    name: "source",
                    data: { values: [{ id: "A" }, { id: "B" }] },
                    // Only inherited record membership requires row identity here.
                    mark: { type: "point", tooltip: null },
                    encoding: { key: { field: "id" } },
                },
            ],
        });
        const selected = getPointSelection(
            views.get({ scope: [], view: "source" })
        );
        selected.setValue([["A"], ["B"]]);
        expect(selected.getValue().data.map((row) => row.id)).toEqual([
            "A",
            "B",
        ]);
    }
);

test.each([false, true])(
    "non-picking selection consumers infer IDs regardless of source order (source first: %s)",
    async (sourceFirst) => {
        /** @type {import("../spec/view.js").UnitSpec} */
        const source = {
            name: "source",
            params: [
                {
                    name: "selected",
                    select: { type: "point", on: "pointerover" },
                    push: "outer",
                },
            ],
            mark: "point",
        };
        /** @type {import("../spec/view.js").UnitSpec[]} */
        const consumers = [
            {
                name: "colored",
                mark: { type: "rule", tooltip: null },
                encoding: {
                    color: {
                        condition: {
                            param: "selected",
                            empty: false,
                            value: "red",
                        },
                        value: "gray",
                    },
                },
            },
            {
                name: "ordered",
                mark: { type: "rule", tooltip: null },
                predicates: {
                    picked: { or: [{ param: "selected", empty: false }] },
                },
                encoding: {
                    order: {
                        condition: { test: { ref: "picked" }, value: 1 },
                        value: 0,
                    },
                },
            },
            {
                name: "inertOrder",
                mark: { type: "rule", tooltip: null },
                encoding: {
                    order: {
                        condition: { param: "selected", value: 0 },
                        value: 0,
                    },
                },
            },
        ];
        const { root, views } = await createTestEmbed({
            params: [{ name: "selected", value: null }],
            data: {
                values: [
                    { id: "A", chrom: "chr1", x: 1 },
                    { id: "B", chrom: "chr1", x: 2 },
                ],
            },
            // Match IDs across branches while leaving channel inference to Core.
            transform: [{ type: "identifier" }],
            encoding: {
                key: { field: "id" },
                x: { chrom: "chrom", pos: "x", type: "locus", axis: null },
            },
            vconcat: sourceFirst
                ? [source, ...consumers]
                : [...consumers, source],
        });
        const [colored, ordered, inertOrder] = Array.from(units(root)).filter(
            (v) => v.name !== "source"
        );
        for (const unit of [colored, ordered]) {
            expect(unit.mark.isPickingParticipant()).toBe(false);
            expect(unit.mark.encoders.uniqueId).toBeDefined();
        }
        expect(inertOrder.mark.getOrder()).toBeUndefined();
        expect(inertOrder.mark.encoders.uniqueId).toBeUndefined();
        getPointSelection(views.get({ scope: [], view: "source" })).setValue([
            ["A"],
        ]);
        const [picked, other] = colored.getCollector().getData();
        expect(colored.mark.encoders.color(picked)).toBe("red");
        expect(colored.mark.encoders.color(other)).toBe("gray");
        expect(ordered.mark.getOrder().predicate(picked)).toBe(true);
        expect(ordered.mark.getOrder().predicate(other)).toBe(false);
    }
);

test("inserted and newly visible consumers infer IDs while preserving explicit ID channels", async () => {
    const { root, views, context } = await createTestEmbed(
        {
            params: [{ name: "selected", value: null }],
            layer: [
                {
                    name: "source",
                    params: [
                        { name: "selected", select: "point", push: "outer" },
                    ],
                    data: { values: [{ x: 1 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative", axis: null },
                    },
                },
            ],
        },
        {
            contextOptions: {
                isViewConfiguredVisible: (view) => view.spec.visible ?? true,
            },
        }
    );
    /** @type {import("../spec/view.js").UnitSpec} */
    const spec = {
        name: "consumer",
        visible: false,
        data: { values: [{ x: 2, customId: 42 }] },
        mark: { type: "rule", tooltip: null },
        encoding: {
            x: { field: "x", type: "quantitative", axis: null },
            color: {
                condition: { param: "selected", empty: false, value: "red" },
                value: "gray",
            },
        },
    };
    await views.insert(views.root(), spec);
    const consumer = units(root).find((v) => v.name === "consumer");
    expect(consumer.getCollector()).toBeUndefined();
    consumer.spec.visible = true;
    await initializeVisibleViewData(
        root,
        context.dataFlow,
        context.textMetrics
    );
    const [row] = consumer.getCollector().getData();
    expect(Number.isSafeInteger(row[UNIQUE_ID_KEY])).toBe(true);
    expect(consumer.mark.encoders.uniqueId(row)).toBe(row[UNIQUE_ID_KEY]);

    await views.insert(views.root(), {
        ...spec,
        name: "explicit",
        visible: true,
        encoding: { ...spec.encoding, uniqueId: { field: "customId" } },
    });
    const explicit = units(root).find((v) => v.name === "explicit");
    expect(
        explicit.mark.encoders.uniqueId(
            Array.from(explicit.getCollector().getData())[0]
        )
    ).toBe(42);
});

test("interval-only conditions do not allocate record identity", async () => {
    const { root } = await createTestEmbed({
        params: [
            { name: "brush", select: { type: "interval", encodings: ["x"] } },
        ],
        data: { values: [{ x: 1 }] },
        mark: { type: "rule", tooltip: null },
        encoding: {
            x: { field: "x", type: "quantitative", axis: null },
            color: {
                condition: { param: "brush", value: "red" },
                value: "gray",
            },
        },
    });
    const [unit] = units(root);
    expect(unit.mark.encoders.uniqueId).toBeUndefined();
    expect(Array.from(unit.getCollector().getData())[0]).not.toHaveProperty(
        UNIQUE_ID_KEY
    );
});

test("inherited point selection does not assign identities to generated axes and legends", async () => {
    // Include the implicit grid: an unwrapped unit has no generated guides.
    const { root: view, views: api } = await createTestEmbed(
        {
            params: [{ name: "selected", select: "point" }],
            data: {
                values: [
                    { id: "A", x: 1, group: "g" },
                    { id: "B", x: 2, group: "g" },
                ],
            },
            layer: [
                {
                    name: "records",
                    mark: { type: "point", tooltip: null },
                    encoding: {
                        key: { field: "id" },
                        x: { field: "x", type: "quantitative" },
                        color: {
                            field: "group",
                            type: "nominal",
                            scale: { domain: ["g"] },
                            legend: {},
                        },
                    },
                },
            ],
        },
        { contextOptions: { viewFactoryOptions: { wrapRoot: true } } }
    );
    const guides = units(view).filter(isInChromeSubtree);
    expect(guides.length).toBeGreaterThan(4);
    expect(guides.some((unit) => unit.getCollector().getItemCount() > 0)).toBe(
        true
    );
    for (const guide of guides) {
        expect(guide.mark.isPickingParticipant()).toBe(false);
        expect(
            guide.mark.encoding.uniqueId,
            guide.getPathString()
        ).toBeUndefined();
        expect(
            Array.from(guide.getCollector().getData()).some(
                (row) => UNIQUE_ID_KEY in row
            )
        ).toBe(false);
    }
    const source = api.get({ scope: [], view: "records" });
    const selection = getPointSelection(source);
    selection.setValue([["A"], ["B"]]);
    expect(selection.getValue().data.map((row) => row.id)).toEqual(["A", "B"]);
});

test.each([
    ["no selection", [], [], false],
    [
        "interval only",
        [{ name: "chosen", select: { type: "interval", encodings: ["x"] } }],
        [],
        false,
    ],
    ["inherited point", [{ name: "chosen", select: "point" }], [], true],
    [
        "plain shadow",
        [{ name: "chosen", select: "point" }],
        [{ name: "chosen", value: 0 }],
        false,
    ],
    [
        "interval shadow",
        [{ name: "chosen", select: "point" }],
        [{ name: "chosen", select: { type: "interval", encodings: ["x"] } }],
        false,
    ],
    [
        "another visible point",
        [
            { name: "chosen", select: "point" },
            { name: "other", select: "point" },
        ],
        [{ name: "chosen", value: 0 }],
        true,
    ],
])(
    "non-picking identity follows effective declarations: %s",
    async (_name, outer, inner, needsIdentity) => {
        const { root: view, views: api } = await createTestEmbed({
            params: /** @type {import("../spec/parameter.js").Parameter[]} */ (
                outer
            ),
            data: {
                values: [
                    { id: "A", x: 1 },
                    { id: "B", x: 2 },
                ],
            },
            layer: [
                {
                    name: "records",
                    params: /** @type {import("../spec/parameter.js").Parameter[]} */ (
                        inner
                    ),
                    mark: { type: "point", tooltip: null },
                    encoding: {
                        key: { field: "id" },
                        x: { field: "x", type: "quantitative" },
                    },
                },
            ],
        });
        const unit = units(view)[0];
        // An interval declaration does not override tooltip:null for picking.
        expect(unit.mark.isPickingParticipant()).toBe(false);
        const data = Array.from(unit.getCollector().getData());
        expect(data.every((row) => UNIQUE_ID_KEY in row)).toBe(needsIdentity);
        expect(Boolean(unit.mark.encoding.uniqueId)).toBe(needsIdentity);
        const handle = api.get({ scope: [], view: "records" });
        if (needsIdentity) {
            const name = _name === "another visible point" ? "other" : "chosen";
            const selection = getPointSelection(handle, name);
            selection.setValue([["A"], ["B"]]);
            expect(selection.getValue().data).toHaveLength(2);
        } else if (_name === "plain shadow") {
            expect(() => handle.params.getSelection("chosen")).toThrow(
                "not a selection"
            );
        }
    }
);

test("selection identity preserves independent branches and existing identifiers through replay", async () => {
    const rows = [
        { id: "A", x: 1 },
        { id: "B", x: 2 },
    ];
    const { root: view, views: api } = await createTestEmbed({
        datasets: { rows },
        params: [{ name: "selected", select: "point" }],
        data: { name: "rows" },
        layer: [
            {
                name: "selectedRows",
                transform: [
                    { type: "aggregate", groupby: ["id"] },
                    { type: "identifier" },
                ],
                mark: { type: "point", tooltip: null },
                encoding: { key: { field: "id" } },
            },
            {
                params: [{ name: "selected", value: false }],
                mark: { type: "point", tooltip: null },
            },
        ],
    });
    const [source, sibling] = units(view);
    const handle = api.get({ scope: [], view: "selectedRows" });
    const selection = getPointSelection(handle);
    const check = () => {
        const data = Array.from(source.getCollector().getData());
        const ids = data.map((row) => row[UNIQUE_ID_KEY]);
        expect(ids.every((id) => Number.isSafeInteger(id) && id > 0)).toBe(
            true
        );
        expect(new Set(ids).size).toBe(data.length);
        let identifierCount = 0;
        for (
            let node = /** @type {import("../data/flowNode.js").default} */ (
                source.getCollector()
            );
            node;
            node = node.parent
        ) {
            if (node instanceof IdentifierTransform) identifierCount++;
        }
        expect(identifierCount).toBe(1);
        selection.setValue(data.map((row) => [row.id]));
        expect(selection.getValue().data).toHaveLength(data.length);
        expect(Array.from(sibling.getCollector().getData())).toEqual(rows);
    };
    check();
    selection.clear();
    api.root().datasets.set("rows", rows);
    check();
    expect(rows).toEqual([
        { id: "A", x: 1 },
        { id: "B", x: 2 },
    ]);
});

test("selection-only IDs span facets and survive source replay", async () => {
    const { root: view, views: api } = await createTestEmbed({
        params: [{ name: "selected", select: "point" }],
        datasets: {
            rows: [
                { id: "A", group: 1 },
                { id: "B", group: 2 },
            ],
        },
        data: { name: "rows" },
        facet: { field: "group" },
        spec: {
            name: "records",
            mark: { type: "text", tooltip: null },
            encoding: { key: { field: "id" }, text: { field: "id" } },
        },
    });
    const selection = getPointSelection(
        api.get({ scope: [], view: "records" })
    );
    const source = units(view).find((unit) => unit.name === "records");
    selection.setValue([["A"], ["B"]]);
    expect(selection.getValue().data.map((row) => row.id)).toEqual(["A", "B"]);
    expect(source.mark.isPickingParticipant()).toBe(false);
    selection.clear();
    api.root().datasets.set("rows", [
        { id: "C", group: 3 },
        { id: "D", group: 3 },
    ]);
    selection.setValue([["C"], ["D"]]);
    expect(selection.getValue().data.map((row) => row.id)).toEqual(["C", "D"]);
    const data = Array.from(source.getCollector().getData());
    expect(new Set(data.map((row) => row[UNIQUE_ID_KEY])).size).toBe(2);
});

test("removing and reinserting a selection source leaves no stale identity branch", async () => {
    /** @type {import("../spec/view.js").UnitSpec} */
    const spec = {
        name: "records",
        data: { values: [{ id: "A" }] },
        mark: { type: "text", tooltip: null },
        encoding: { key: { field: "id" }, text: { field: "id" } },
    };
    const {
        context,
        views: api,
        finalize,
    } = await createTestEmbed({
        params: [{ name: "selected", select: "point" }],
        layer: [spec],
    });
    const old = api.get({ scope: [], view: "records" });
    const previous = getPointSelection(old);
    previous.setValue([["A"]]);
    previous.clear();
    const count = context.dataFlow.collectors.length;
    await api.remove(old);
    const replacement = await api.insert(api.root(), spec);
    const selected = getPointSelection(replacement);
    selected.setValue([["A"]]);
    expect(selected.getValue().data.map((row) => row.id)).toEqual(["A"]);
    expect(() => previous.setValue([["A"]])).toThrow();
    expect(context.dataFlow.collectors).toHaveLength(count);
    finalize();
    expect(context.dataFlow.collectors).toEqual([]);
    expect(context.dataFlow.dataSources).toEqual([]);
});
