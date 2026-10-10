import { afterEach, expect, test, vi } from "vitest";
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

/** @param {FacetView} view @param {string} name */
function collector(view, name) {
    return /** @type {import("./unitView.js").default} */ (
        view.getDescendants().find((child) => child.name === name)
    ).getCollector();
}

afterEach(() => vi.unstubAllGlobals());

test("layered tuple facets isolate aggregate → stack and filter → window", async () => {
    const view = await createAndInitialize(
        {
            data: { values: data.map((d) => ({ ...d, row: "R" })) },
            facet: { row: { field: "row" }, column: { field: "g" } },
            spec: {
                layer: [
                    {
                        name: "means",
                        transform: [
                            {
                                type: "aggregate",
                                fields: ["v"],
                                ops: ["mean"],
                                as: ["mean"],
                            },
                            { type: "stack", field: "mean", groupby: [] },
                        ],
                        mark: "point",
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
                        transform: [
                            { type: "filter", expr: "datum.v > 1" },
                            {
                                type: "collect",
                                sort: { field: "v", order: "descending" },
                            },
                            {
                                type: "window",
                                ops: ["row_number"],
                                as: ["rank"],
                            },
                        ],
                        mark: "point",
                    },
                ],
            },
        },
        FacetView
    );
    try {
        const means = collector(view, "means");
        expect(means.facetBatches.get(["R", "A"])).toMatchObject([
            { mean: 2, y0: 0, y1: 2 },
        ]);
        expect(means.facetBatches.get(["R", "B"])).toMatchObject([
            { mean: 15, y0: 0, y1: 15 },
        ]);
        expect(
            collector(view, "ranks")
                .facetBatches.get(["R", "B"])
                .map((d) => d.rank)
        ).toEqual([1, 2]);
        const unit = /** @type {import("./unitView.js").default} */ (
            view.getDescendants().find((v) => v.name === "means")
        );
        unit.getScaleResolution("x").reconfigure();
        expect(unit.getScaleResolution("x").getScale().domain()).toEqual([
            0, 15,
        ]);
    } finally {
        view.disposeSubtree();
    }
});

test("outer transforms set membership while child field edits preserve it", async () => {
    const view = await createAndInitialize(
        {
            data: { values: data },
            transform: [
                {
                    type: "aggregate",
                    groupby: ["g"],
                    fields: ["v"],
                    ops: ["mean"],
                    as: ["v"],
                },
            ],
            facet: { field: "g" },
            spec: {
                name: "points",
                transform: [
                    { type: "formula", expr: "'changed'", as: "g" },
                    { type: "project", fields: ["v"] },
                ],
                mark: "point",
            },
        },
        FacetView
    );
    try {
        expect(collector(view, "points").facetBatches.get(["A"])).toMatchObject(
            [{ v: 2 }]
        );
        expect(collector(view, "points").facetBatches.get(["B"])).toMatchObject(
            [{ v: 15 }]
        );
        expect(Array.from(view.flowHandle.collector.getData())).toEqual([
            { g: "A", v: 2 },
            { g: "B", v: 15 },
        ]);
    } finally {
        view.disposeSubtree();
    }
});

test("replay preserves empty cells and updates membership without growing the graph", async () => {
    const view = await createAndInitialize(
        {
            params: [{ name: "lower", value: 0 }],
            data: { values: data },
            facet: { field: "g" },
            spec: {
                name: "counts",
                width: 100,
                transform: [
                    { type: "filter", expr: "datum.v >= lower" },
                    { type: "aggregate" },
                    { type: "identifier" },
                ],
                mark: "point",
            },
        },
        FacetView
    );
    const flow = view.context.dataFlow;
    try {
        renderToLayout(view);
        const size = view.getSize();
        const output = collector(view, "counts");
        view.paramRuntime.setValue("lower", 5);
        view.paramRuntime.flushNow();
        expect(output.facetBatches.get(["A"])[0].count).toBe(0);
        expect(output.facetBatches.get(["B"])[0].count).toBe(2);
        expect(view.getSize()).toEqual(size);
        expect(
            new Set(Array.from(output.getData(), (d) => d[UNIQUE_ID_KEY])).size
        ).toBe(2);

        /** @returns {number} */
        const nodeCount = () => {
            let count = 0;
            for (const source of flow.dataSources) {
                source.visit(() => {
                    count++;
                });
            }
            return count;
        };
        const initialNodes = nodeCount();
        const source =
            /** @type {import("../data/sources/inlineSource.js").default} */ (
                view.flowHandle.dataSource
            );
        source.updateDynamicData(
            Array.from({ length: 50 }, (_, g) => ({ g, v: 10 }))
        );
        expect(
            Array.from(output.facetBatches.keys()).filter(
                (key) => key !== undefined
            )
        ).toHaveLength(50);
        expect(view.getSize().width.px).toBeGreaterThan(size.width.px);
        expect(nodeCount()).toBe(initialNodes);
        source.updateDynamicData([{ g: "C", v: 6 }]);
        expect(
            Array.from(output.facetBatches.keys()).filter(
                (key) => key !== undefined
            )
        ).toEqual([["C"]]);
    } finally {
        view.disposeSubtree();
    }
    expect(flow.collectors).toEqual([]);
    expect(flow.dataSources).toEqual([]);
});

test("a child-owned dataset stays ungrouped and repeats in every input cell", async () => {
    const view = await createAndInitialize(
        {
            data: { values: data },
            facet: { field: "g" },
            spec: {
                name: "constant",
                data: { values: [{ v: 4 }, { v: 8 }] },
                transform: [
                    {
                        type: "aggregate",
                        fields: ["v"],
                        ops: ["mean"],
                        as: ["mean"],
                    },
                ],
                mark: "point",
            },
        },
        FacetView
    );
    try {
        expect(
            Array.from(collector(view, "constant").facetBatches.keys())
        ).toEqual([undefined]);
        expect(Array.from(collector(view, "constant").getData())).toMatchObject(
            [{ mean: 6 }]
        );
        const layout = renderToLayout(view);
        expect(layout).toBeDefined();
        expect(
            /** @type {import("./unitView.js").default} */ (view.child)
                .facetCoords.size
        ).toBe(2);
    } finally {
        view.disposeSubtree();
    }
});

test("a shared foreign relation replays each facet after an update", async () => {
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
            name: "joined",
            transform: [
                {
                    type: "lookup",
                    from: { name: "table" },
                    key: "key",
                    values: ["value"],
                },
            ],
            mark: "point",
        },
    });
    try {
        const facet = /** @type {FacetView} */ (view);
        const output = collector(facet, "joined");
        expect(Array.from(output.getData(), (d) => d.value)).toEqual([7, 7]);
        context.dataFlow.updateNamedDataBinding(
            view.namedDataScope.resolve("table"),
            [{ key: 1, value: 9 }]
        );
        view.paramRuntime.flushNow();
        await vi.waitFor(() =>
            expect(Array.from(output.getData(), (d) => d.value)).toEqual([9, 9])
        );
        expect(output.facetBatches.get(["A"])[0].value).toBe(9);
        expect(output.facetBatches.get(["B"])[0].value).toBe(9);
    } finally {
        view.disposeSubtree();
    }
});

test("multi-file input keeps shapes and local forward references through replay", async () => {
    vi.stubGlobal(
        "fetch",
        vi.fn(
            async (url) =>
                new Response(
                    url === "first.json"
                        ? JSON.stringify([
                              { g: "A", id: 1, peer: 2, v: 1 },
                              { g: "B", id: 1, peer: 2, v: 10 },
                          ])
                        : JSON.stringify([
                              { g: "A", id: 2, peer: 1, v: 3, extra: 9 },
                              { g: "B", id: 2, peer: 1, v: 20, extra: 8 },
                          ])
                )
        )
    );
    const view = await createAndInitialize(
        {
            params: [{ name: "factor", value: 1 }],
            data: {
                url: ["first.json", "second.json"],
                format: { type: "json" },
            },
            facet: { field: "g" },
            spec: {
                name: "files",
                transform: [
                    {
                        type: "lookup",
                        from: { source: "input" },
                        key: "id",
                        fields: ["peer"],
                        values: ["v"],
                        as: ["other"],
                    },
                    {
                        type: "formula",
                        expr: "datum.other * factor",
                        as: "scaled",
                    },
                ],
                mark: "point",
            },
        },
        FacetView
    );
    try {
        const output = collector(view, "files");
        expect(output.facetBatches.get(["A"])).toMatchObject([
            { other: 3, scaled: 3 },
            { other: 1, scaled: 1, extra: 9 },
        ]);
        view.paramRuntime.setValue("factor", 2);
        view.paramRuntime.flushNow();
        expect(output.facetBatches.get(["B"])).toMatchObject([
            { other: 20, scaled: 40 },
            { other: 10, scaled: 20, extra: 8 },
        ]);
        expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
        view.disposeSubtree();
    }
});

test.each([
    "displace1d",
    "filterScoredLabels",
    "packLegendLabels",
    "axisLabelLayout",
    "collect",
])("rejects unsupported %s within inherited facet data", async (type) => {
    await expect(
        createAndInitialize(
            {
                data: { values: data },
                facet: { field: "g" },
                spec: {
                    transform: [/** @type {any} */ ({ type, groupby: ["v"] })],
                    mark: "point",
                },
            },
            FacetView
        )
    ).rejects.toThrow(
        type === "collect"
            ? /cannot repartition/
            : /does not support inherited facet/
    );
});
