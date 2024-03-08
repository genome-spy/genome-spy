import { expect, test } from "vitest";
import Collector from "../data/collector.js";
import FlowNode from "../data/flowNode.js";
import FilterTransform from "../data/transforms/filter.js";
import FormulaTransform from "../data/transforms/formula.js";
import InlineSource from "../data/sources/inlineSource.js";
import SequenceSource from "../data/sources/sequenceSource.js";
import { buildDataFlow } from "./flowBuilder.js";
import { create } from "./testUtils.js";
import CloneTransform from "../data/transforms/clone.js";
import LayerView from "./layerView.js";
import UnitView from "./unitView.js";

/**
 *
 * @param {FlowNode} root
 * @param {number[]} path
 */
function byPath(root, path) {
    for (const elem of path) {
        root = root.children[elem];
    }
    return root;
}

/** @type {import("../spec/mark.js").MarkProps} */
const mark = {
    type: "rect",
    tooltip: null,
};

test("Trivial flow", async () => {
    const root = await create(
        {
            data: { values: [3.141] },
            transform: [
                {
                    type: "formula",
                    expr: "datum.data * 2",
                    as: "x",
                },
            ],
            mark,
        },
        UnitView
    );

    const flow = buildDataFlow(root);
    const dataSource = flow.dataSources[0];

    expect(dataSource).toBeInstanceOf(InlineSource);
    expect(byPath(dataSource, [0])).toBeInstanceOf(CloneTransform);
    expect(byPath(dataSource, [0, 0])).toBeInstanceOf(FormulaTransform);
    expect(byPath(dataSource, [0, 0, 0])).toBeInstanceOf(Collector);

    expect(flow.collectors[0]).toBe(byPath(dataSource, [0, 0, 0]));
});

test("Branching flow", async () => {
    const root = await create(
        {
            data: { values: [3.141] },
            layer: [
                {
                    transform: [
                        {
                            type: "formula",
                            expr: "datum.data * 2",
                            as: "x",
                        },
                    ],
                    mark,
                },
                {
                    transform: [
                        {
                            type: "filter",
                            expr: "datum.data > 4",
                        },
                    ],
                    mark,
                },
            ],
        },
        LayerView
    );

    const dataSource = buildDataFlow(root).dataSources[0];

    expect(dataSource).toBeInstanceOf(InlineSource);
    // Formula transform modifies data and it should be implicitly preceded by CloneTransform
    expect(byPath(dataSource, [0])).toBeInstanceOf(CloneTransform);
    expect(byPath(dataSource, [0, 0])).toBeInstanceOf(FormulaTransform);
    expect(byPath(dataSource, [0, 0, 0])).toBeInstanceOf(Collector);
    expect(byPath(dataSource, [1])).toBeInstanceOf(FilterTransform);
    expect(byPath(dataSource, [1, 0])).toBeInstanceOf(Collector);
});

test("Nested data sources", async () => {
    const root = await create(
        {
            data: { values: [1] },
            transform: [{ type: "filter", expr: "datum.data > 0" }],
            layer: [
                {
                    data: { sequence: { start: 0, stop: 5 } },
                    transform: [{ type: "formula", expr: "3", as: "foo" }],
                    mark,
                },
            ],
        },
        LayerView
    );

    const dataSources = buildDataFlow(root).dataSources;

    expect(dataSources[0]).toBeInstanceOf(InlineSource);
    expect(dataSources[0].children[0]).toBeInstanceOf(FilterTransform);
    expect(dataSources[0].children[0].children.length).toEqual(0);

    expect(byPath(dataSources[1], [])).toBeInstanceOf(SequenceSource);
    expect(byPath(dataSources[1], [0])).toBeInstanceOf(CloneTransform);
    expect(byPath(dataSources[1], [0, 0])).toBeInstanceOf(FormulaTransform);
    expect(byPath(dataSources[1], [0, 0, 0])).toBeInstanceOf(Collector);
});
