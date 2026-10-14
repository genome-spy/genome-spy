import { expect, test } from "vitest";
import DendrogramTransform from "./dendrogram.js";
import RegexFoldTransform from "./regexFold.js";
import Collector from "../collector.js";
import { processData } from "../flowTestUtils.js";
import { UNIQUE_ID_KEY } from "./identifier.js";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import UnitView from "../../view/unitView.js";

/** @type {import("../../spec/transform.js").DendrogramParams} */
const params = {
    type: "dendrogram",
    key: "id",
    parentKey: "parent",
    height: "height",
    leafIndex: "row",
};

/** @returns {import("../flowNode.js").Datum[]} */
function tree() {
    return [
        { id: "root", parent: null, height: 3 },
        { id: "A", parent: "AB", height: 0, row: 0 },
        { id: "ABC", parent: "root", height: 2 },
        { id: "B", parent: "AB", height: 0, row: 1 },
        {
            id: "C",
            parent: "ABC",
            height: 0,
            row: 2,
            label: "Leaf C",
            sourceId: "overwritten",
            [UNIQUE_ID_KEY]: 42,
        },
        { id: "D", parent: "root", height: 0, row: 3 },
        { id: "AB", parent: "ABC", height: 1 },
    ];
}

test("lays out an unbalanced tree with stable identities, heights, and copied metadata", () => {
    const input = tree();
    const original = structuredClone(input);
    const edges = processData(new DendrogramTransform(params), input);
    expect(edges).toHaveLength(6);
    const byTarget = new Map(edges.map((edge) => [edge.targetId, edge]));
    expect(byTarget.get("ABC")).toMatchObject({
        sourceId: "root",
        sourceHeight: 3,
        targetHeight: 2,
        sourceIndex: 2,
        sourceOffset: 0.125,
        targetIndex: 1,
        targetOffset: 0.25,
    });
    expect(byTarget.get("AB")).toMatchObject({
        sourceId: "ABC",
        sourceIndex: 1,
        sourceOffset: 0.25,
        targetIndex: 0,
        targetOffset: 0.5,
    });
    expect(byTarget.get("C")).toMatchObject({
        sourceId: "ABC",
        label: "Leaf C",
        targetIndex: 2,
        targetOffset: 0,
    });
    expect(edges.every((edge) => !(UNIQUE_ID_KEY in edge))).toBe(true);
    expect(input).toEqual(original);
});

test("supports nonbinary trees, gaps in leaf indices, typed keys, and renamed output", () => {
    const edges = processData(
        new DendrogramTransform({
            ...params,
            as: ["from", "to", "h1", "h2", "i1", "i2", "f1", "f2"],
        }),
        [
            { id: 1, parent: "root", height: 0, row: 1 },
            { id: "1", parent: "root", height: 0, row: 3 },
            { id: "third", parent: "root", height: 0, row: 8 },
            { id: "root", parent: null, height: 4 },
        ]
    );
    expect(
        edges.map((edge) => [edge.from, edge.to, edge.i1, edge.f1, edge.i2])
    ).toEqual([
        ["root", 1, 4, 0.5, 1],
        ["root", "1", 4, 0.5, 3],
        ["root", "third", 4, 0.5, 8],
    ]);
});

/** @type {[string, (rows: import("../flowNode.js").Datum[]) => void, string][]} */
const invalidCases = [
    [
        "duplicate key",
        (rows) => {
            rows[1].id = "root";
        },
        "duplicate dendrogram key",
    ],
    [
        "missing parent",
        (rows) => {
            rows[1].parent = "missing";
        },
        "Missing dendrogram parent",
    ],
    [
        "cycle",
        (rows) => {
            rows[2].parent = "AB";
        },
        "cycle or disconnected",
    ],
    [
        "invalid height",
        (rows) => {
            rows[1].height = -1;
        },
        "Invalid dendrogram height",
    ],
    [
        "invalid index",
        (rows) => {
            rows[1].row = 0.5;
        },
        "Invalid dendrogram leaf index",
    ],
    [
        "duplicate index",
        (rows) => {
            rows[1].row = 1;
        },
        "Duplicate dendrogram leaf index",
    ],
    [
        "interleaved subtree",
        (rows) => {
            rows[3].row = 2;
            rows[4].row = 1;
        },
        "Incompatible dendrogram leaf order",
    ],
];

test.each(invalidCases)(
    "rejects %s at the input boundary",
    (_name, mutate, message) => {
        const rows = tree();
        mutate(rows);
        expect(() =>
            processData(new DendrogramTransform(params), rows)
        ).toThrow(message);
    }
);

test("empty and single-leaf trees emit no edges, and reset clears the previous tree", () => {
    const transform = new DendrogramTransform(params);
    expect(processData(transform, tree())).toHaveLength(6);
    transform.reset();
    expect(
        processData(transform, [
            { id: "only", parent: null, height: 0, row: 0 },
        ])
    ).toEqual([]);
    transform.reset();
    expect(processData(transform, [])).toEqual([]);
});

test("a deep comb tree does not depend on the JavaScript call stack", () => {
    const count = 10000;
    const rows = Array.from({ length: count }, (_, i) => ({
        id: "leaf" + i,
        parent: "merge" + Math.max(1, i),
        height: 0,
        row: i,
    }));
    const merges = Array.from({ length: count - 1 }, (_, i) => ({
        id: "merge" + (i + 1),
        parent: i === count - 2 ? null : "merge" + (i + 2),
        height: i + 1,
    }));
    expect(
        processData(new DendrogramTransform(params), [...rows, ...merges])
    ).toHaveLength(count * 2 - 2);
});

test("preserves file shapes within facets and isolates successive trees", () => {
    const transform = new DendrogramTransform(params);
    const fold = new RegexFoldTransform({
        type: "regexFold",
        columnRegex: "^value_(.*)$",
        asValue: "value",
        asKey: "sample",
    });
    const output = new Collector();
    transform.addChild(fold);
    fold.addChild(output);
    transform.beginBatch({ type: "facet", facetId: ["first"] });
    transform.beginBatch({ type: "file", url: "a" });
    transform.handle({ id: "root", parent: null, height: 1, value_a: 0 });
    transform.handle({
        id: "A",
        parent: "root",
        height: 0,
        row: 0,
        value_a: 10,
    });
    transform.beginBatch({ type: "file", url: "b" });
    transform.handle({
        id: "B",
        parent: "root",
        height: 0,
        row: 1,
        value_b: 20,
    });
    transform.beginBatch({ type: "facet", facetId: ["second"] });
    transform.beginBatch({ type: "file", url: "c" });
    transform.handle({ id: "root", parent: null, height: 2, value_c: 0 });
    transform.handle({
        id: "C",
        parent: "root",
        height: 0,
        row: 0,
        value_c: 30,
    });
    transform.complete();
    expect(
        output.facetBatches
            .get(["first"])
            .map((edge) => [edge.targetId, edge.sample, edge.value])
    ).toEqual([
        ["A", "a", 10],
        ["B", "b", 20],
    ]);
    expect(
        output.facetBatches
            .get(["second"])
            .map((edge) => [edge.targetId, edge.sample, edge.value])
    ).toEqual([["C", "c", 30]]);
});

test("the public dataflow assigns edge identities after upstream node IDs and replays updates", async () => {
    const { view, context } = await createHeadlessEngine({
        datasets: { tree: tree() },
        data: { name: "tree" },
        transform: [{ type: "identifier" }],
        layer: [
            {
                mark: "point",
                encoding: { x: { value: 0.5 }, y: { value: 0.5 } },
            },
            {
                transform: [params],
                mark: "link",
                encoding: {
                    x: { field: "sourceHeight", type: "quantitative" },
                    x2: { field: "targetHeight" },
                    y: { field: "sourceIndex", type: "index" },
                    y2: { field: "targetIndex" },
                },
            },
        ],
    });
    const [nodeView, edgeView] = Array.from(view.getDescendants()).filter(
        (child) => child instanceof UnitView
    );
    const nodes = nodeView.getCollector();
    const edges = edgeView.getCollector();
    const nodeIds = new Set(
        Array.from(nodes.getData(), (node) => node[UNIQUE_ID_KEY])
    );
    expect(edges.getItemCount()).toBe(6);
    for (const edge of edges.getData()) {
        expect(nodeIds.has(edge[UNIQUE_ID_KEY])).toBe(false);
        expect(edges.findDatumByUniqueId(edge[UNIQUE_ID_KEY])).toBe(edge);
    }
    const source = context.dataFlow.findNamedDataSource("tree").dataSource;
    source.updateDynamicData([]);
    expect(edges.getItemCount()).toBe(0);
    source.updateDynamicData(tree());
    expect(edges.getItemCount()).toBe(6);
});
