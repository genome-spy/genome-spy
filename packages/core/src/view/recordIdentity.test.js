import { expect, test } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import IdentifierTransform, {
    UNIQUE_ID_KEY,
} from "../data/transforms/identifier.js";
import { isInChromeSubtree } from "./viewChrome.js";
import UnitView from "./unitView.js";
import { createViewMutationApi } from "./viewMutationApi.js";

/** @param {import("./view.js").default} root */
function units(root) {
    return root.getDescendants().filter((view) => view instanceof UnitView);
}

test("inherited point selection does not assign identities to generated axes and legends", async () => {
    // Include the implicit grid: an unwrapped unit has no generated guides.
    const { view } = await createHeadlessEngine(
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
    const source = createViewMutationApi({ viewRoot: view }).get({
        scope: [],
        view: "records",
    });
    const selection = source.params.getSelection("selected");
    if (selection.type !== "point") throw new Error("Expected point selection");
    selection.setValue([["A"], ["B"]]);
    expect(selection.getValue().data.map((row) => row.id)).toEqual(["A", "B"]);
    view.disposeSubtree();
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
        const { view } = await createHeadlessEngine({
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
        const handle = createViewMutationApi({ viewRoot: view }).get({
            scope: [],
            view: "records",
        });
        if (needsIdentity) {
            const name = _name === "another visible point" ? "other" : "chosen";
            const selection = handle.params.getSelection(name);
            if (selection.type !== "point")
                throw new Error("Expected point selection");
            selection.setValue([["A"], ["B"]]);
            expect(selection.getValue().data).toHaveLength(2);
        } else if (_name === "plain shadow") {
            expect(() => handle.params.getSelection("chosen")).toThrow(
                "not a selection"
            );
        }
        view.disposeSubtree();
    }
);

test("selection identity preserves independent branches and existing identifiers through replay", async () => {
    const rows = [
        { id: "A", x: 1 },
        { id: "B", x: 2 },
    ];
    const { view } = await createHeadlessEngine({
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
    const api = createViewMutationApi({ viewRoot: view });
    const handle = api.get({ scope: [], view: "selectedRows" });
    const selection = handle.params.getSelection("selected");
    if (selection.type !== "point") throw new Error("Expected point selection");
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
    view.disposeSubtree();
});

test("selection-only IDs span facets and survive source replay", async () => {
    const { view } = await createHeadlessEngine({
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
    const api = createViewMutationApi({ viewRoot: view });
    const selection = api
        .get({ scope: [], view: "records" })
        .params.getSelection("selected");
    if (selection.type !== "point") throw new Error("Expected point selection");
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
    view.disposeSubtree();
});

test("removing and reinserting a selection source leaves no stale identity branch", async () => {
    /** @type {import("../spec/view.js").UnitSpec} */
    const spec = {
        name: "records",
        data: { values: [{ id: "A" }] },
        mark: { type: "text", tooltip: null },
        encoding: { key: { field: "id" }, text: { field: "id" } },
    };
    const { view, context } = await createHeadlessEngine({
        params: [{ name: "selected", select: "point" }],
        layer: [spec],
    });
    const api = createViewMutationApi({ viewRoot: view });
    const old = api.get({ scope: [], view: "records" });
    const previous = old.params.getSelection("selected");
    if (previous.type !== "point") throw new Error("Expected point selection");
    previous.setValue([["A"]]);
    previous.clear();
    const count = context.dataFlow.collectors.length;
    await api.remove(old);
    const replacement = await api.insert(api.root(), spec);
    const selected = replacement.params.getSelection("selected");
    if (selected.type !== "point") throw new Error("Expected point selection");
    selected.setValue([["A"]]);
    expect(selected.getValue().data.map((row) => row.id)).toEqual(["A"]);
    expect(() => previous.setValue([["A"]])).toThrow();
    expect(context.dataFlow.collectors).toHaveLength(count);
    view.disposeSubtree();
    expect(context.dataFlow.collectors).toEqual([]);
    expect(context.dataFlow.dataSources).toEqual([]);
});
