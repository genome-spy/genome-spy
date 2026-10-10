import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { createAndInitialize, renderToLayout } from "./testUtils.js";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import FacetView from "./facetView.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";

const data = [
    { g: "A", v: 1 },
    { g: "B", v: 10 },
    { g: "A", v: 3 },
    { g: "B", v: 20 },
];
/** @type {import("../spec/transform.js").AggregateParams} */
const mean = { type: "aggregate", fields: ["v"], ops: ["mean"], as: ["mean"] };
afterEach(() => vi.unstubAllGlobals());

/** @param {Partial<import("../spec/view.js").FacetSpec> & Pick<import("../spec/view.js").FacetSpec, "spec">} overrides */
async function initialize(overrides) {
    const view = await createAndInitialize(
        { data: { values: data }, facet: { field: "g" }, ...overrides },
        FacetView
    );
    onTestFinished(() => view.disposeSubtree());
    return view;
}

/** @param {import("./view.js").default} view @param {string} [name] */
function output(view, name = "points") {
    return /** @type {import("./unitView.js").default} */ (
        view.getDescendants().find((v) => v.name === name)
    ).getCollector();
}

/** @param {object[][]} files */
function mockFiles(files) {
    vi.stubGlobal(
        "fetch",
        vi.fn(
            async (url) => new Response(JSON.stringify(files[Number(url[0])]))
        )
    );
}

// Logical facets span files; reductions/windows restart at facets, while child-owned data stays global.
test("tuple facets isolate layered transforms and leave child-owned data ungrouped", async () => {
    mockFiles(
        [data.slice(0, 2), data.slice(2)].map((rows) =>
            rows.map((d) => ({ ...d, row: "R" }))
        )
    );
    const view = await initialize({
        data: { url: ["0.json", "1.json"], format: { type: "json" } },
        facet: { row: { field: "row" }, column: { field: "g" } },
        spec: {
            layer: [
                {
                    name: "means",
                    mark: "point",
                    transform: [
                        mean,
                        { type: "stack", field: "mean", groupby: [] },
                    ],
                    encoding: {
                        x: {
                            field: "mean",
                            type: "quantitative",
                            scale: { nice: false },
                        },
                    },
                },
                {
                    name: "ranks",
                    mark: "point",
                    transform: [
                        { type: "filter", expr: "datum.v > 1" },
                        {
                            type: "collect",
                            sort: { field: "v", order: "descending" },
                        },
                        { type: "window", ops: ["row_number"], as: ["rank"] },
                    ],
                },
                {
                    name: "constant",
                    mark: "point",
                    data: { values: [{ v: 4 }, { v: 8 }] },
                    transform: [mean],
                },
            ],
        },
    });
    expect(output(view, "means").facetBatches.get(["R", "A"])).toMatchObject([
        { mean: 2, y0: 0, y1: 2 },
    ]);
    expect(output(view, "means").facetBatches.get(["R", "B"])).toMatchObject([
        { mean: 15, y0: 0, y1: 15 },
    ]);
    expect(
        output(view, "ranks")
            .facetBatches.get(["R", "B"])
            .map((d) => [d.v, d.rank])
    ).toEqual([
        [20, 1],
        [10, 2],
    ]);
    expect(Array.from(output(view, "constant").facetBatches.keys())).toEqual([
        undefined,
    ]);
    expect(Array.from(output(view, "constant").getData())).toMatchObject([
        { mean: 6 },
    ]);
    const unit = view.getDescendants().find((v) => v.name === "means");
    unit.getScaleResolution("x").reconfigure();
    expect(unit.getScaleResolution("x").getDomain()).toEqual([0, 15]);
});

test("outer transforms determine membership before child field edits", async () => {
    const view = await initialize({
        transform: [{ ...mean, groupby: ["g"], as: ["v"] }],
        spec: {
            name: "points",
            mark: "point",
            transform: [
                { type: "formula", expr: "'changed'", as: "g" },
                { type: "project", fields: ["v"] },
            ],
        },
    });
    expect(output(view).facetBatches.get(["A"])).toMatchObject([{ v: 2 }]);
    expect(output(view).facetBatches.get(["B"])).toMatchObject([{ v: 15 }]);
    expect(Array.from(view.flowHandle.collector.getData())).toEqual([
        { g: "A", v: 2 },
        { g: "B", v: 15 },
    ]);
});

test("replay retains empty cells, unique identifiers and a static graph; disposal prunes it", async () => {
    const view = await initialize({
        params: [{ name: "lower", value: 0 }],
        spec: {
            name: "points",
            width: 100,
            mark: "point",
            transform: [
                { type: "filter", expr: "datum.v >= lower" },
                { type: "aggregate" },
                { type: "identifier" },
            ],
        },
    });
    renderToLayout(view);
    const size = view.getSize();
    const result = output(view);
    view.paramRuntime.setValue("lower", 5);
    view.paramRuntime.flushNow();
    expect(result.facetBatches.get(["A"])[0].count).toBe(0);
    expect(result.facetBatches.get(["B"])[0].count).toBe(2);
    expect(view.getSize()).toEqual(size);
    expect(
        new Set(Array.from(result.getData(), (d) => d[UNIQUE_ID_KEY])).size
    ).toBe(2);
    const flow = view.context.dataFlow;
    const nodeCount = () => {
        const nodes = new Set();
        flow.dataSources.forEach((s) => s.visit((n) => nodes.add(n)));
        return nodes.size;
    };
    const initial = nodeCount();
    const source =
        /** @type {import("../data/sources/inlineSource.js").default} */ (
            view.flowHandle.dataSource
        );
    source.updateDynamicData(
        Array.from({ length: 50 }, (_, g) => ({ g, v: 10 }))
    );
    expect(Array.from(result.facetBatches.keys()).filter(Boolean)).toHaveLength(
        50
    );
    expect(view.getSize().width.px).toBeGreaterThan(size.width.px);
    expect(nodeCount()).toBe(initial);
    source.updateDynamicData([{ g: "C", v: 6 }]);
    expect(Array.from(result.facetBatches.keys()).filter(Boolean)).toEqual([
        ["C"],
    ]);
    view.disposeSubtree();
    expect(flow.collectors).toEqual([]);
    expect(flow.dataSources).toEqual([]);
});

test("shared foreign relation updates replay every facet", async () => {
    const { view, context } = await createHeadlessEngine({
        datasets: { table: [{ key: 1, value: 7 }] },
        data: {
            values: [
                { g: "A", key: 1 },
                { g: "B", key: 1 },
            ],
        },
        facet: { field: "g" },
        spec: {
            name: "points",
            mark: "point",
            transform: [
                {
                    type: "lookup",
                    from: { name: "table" },
                    key: "key",
                    values: ["value"],
                },
            ],
        },
    });
    onTestFinished(() => view.disposeSubtree());
    const result = output(view);
    expect(Array.from(result.getData(), (d) => d.value)).toEqual([7, 7]);
    context.dataFlow.updateNamedDataBinding(
        view.namedDataScope.resolve("table"),
        [{ key: 1, value: 9 }]
    );
    view.paramRuntime.flushNow();
    await vi.waitFor(() =>
        expect(Array.from(result.getData(), (d) => d.value)).toEqual([9, 9])
    );
    expect(result.facetBatches.get(["A"])[0].value).toBe(9);
    expect(result.facetBatches.get(["B"])[0].value).toBe(9);
});

test("multi-file lookup retains forward references and physical row shapes through replay", async () => {
    const files = [
        [
            { g: "A", id: 1, peer: 2, v: 1 },
            { g: "B", id: 1, peer: 2, v: 10 },
        ],
        [
            { g: "A", id: 2, peer: 1, v: 3, extra: 9 },
            { g: "B", id: 2, peer: 1, v: 20, extra: 8 },
        ],
    ];
    mockFiles(files);
    const view = await initialize({
        params: [{ name: "factor", value: 1 }],
        data: { url: ["0.json", "1.json"], format: { type: "json" } },
        spec: {
            name: "points",
            mark: "point",
            transform: [
                {
                    type: "lookup",
                    from: { source: "input" },
                    key: "id",
                    fields: ["peer"],
                    values: ["v"],
                    as: ["other"],
                },
                { type: "window", ops: ["row_number"], as: ["rank"] },
                { type: "formula", expr: "datum.other * factor", as: "scaled" },
            ],
        },
    });
    expect(output(view).facetBatches.get(["A"])).toMatchObject([
        { other: 3, scaled: 3, rank: 1 },
        { other: 1, scaled: 1, rank: 2, extra: 9 },
    ]);
    view.paramRuntime.setValue("factor", 2);
    view.paramRuntime.flushNow();
    expect(output(view).facetBatches.get(["B"])).toMatchObject([
        { other: 20, scaled: 40, rank: 1 },
        { other: 10, scaled: 20, rank: 2, extra: 8 },
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test.each([
    "displace1d",
    "filterScoredLabels",
    "packLegendLabels",
    "axisLabelLayout",
    "collect",
])("rejects unsupported %s on inherited facet data", async (type) => {
    await expect(
        initialize({
            spec: {
                mark: "point",
                transform: [/** @type {any} */ ({ type, groupby: ["v"] })],
            },
        })
    ).rejects.toThrow(
        type === "collect"
            ? /cannot repartition/
            : /does not support inherited facet/
    );
});
