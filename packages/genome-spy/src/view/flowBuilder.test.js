import Collector from "../data/collector";
import FlowNode from "../data/flowNode";
import FilterTransform from "../data/transforms/filter";
import FormulaTransform from "../data/transforms/formula";
import InlineSource from "../data/sources/inlineSource";
import SequenceSource from "../data/sources/sequenceSource";
import { buildDataFlow } from "./flowBuilder";
import { create } from "./testUtils";
import CloneTransform from "../data/transforms/clone";

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

/** @type {import("../spec/view").MarkConfig} */
const mark = {
    type: "rect",
    tooltip: null
};

test("Trivial flow", () => {
    const root = create({
        data: { values: [3.141] },
        transform: [
            {
                type: "formula",
                expr: "datum.data * 2",
                as: "x"
            }
        ],
        mark
    });

    const flow = buildDataFlow(root);
    const dataSource = flow.dataSources[0];

    expect(dataSource).toBeInstanceOf(InlineSource);
    expect(byPath(dataSource, [0])).toBeInstanceOf(CloneTransform);
    expect(byPath(dataSource, [0, 0])).toBeInstanceOf(FormulaTransform);
    expect(byPath(dataSource, [0, 0, 0])).toBeInstanceOf(Collector);

    expect(flow.collectors[0]).toBe(byPath(dataSource, [0, 0, 0]));
});

test("Branching flow", () => {
    const root = create({
        data: { values: [3.141] },
        layer: [
            {
                transform: [
                    {
                        type: "formula",
                        expr: "datum.data * 2",
                        as: "x"
                    }
                ],
                mark
            },
            {
                transform: [
                    {
                        type: "filter",
                        expr: "datum.data > 4"
                    }
                ],
                mark
            }
        ]
    });

    const dataSource = buildDataFlow(root).dataSources[0];

    expect(dataSource).toBeInstanceOf(InlineSource);
    // Formula transform modifies data and it should be implicitly preceded by CloneTransform
    expect(byPath(dataSource, [0])).toBeInstanceOf(CloneTransform);
    expect(byPath(dataSource, [0, 0])).toBeInstanceOf(FormulaTransform);
    expect(byPath(dataSource, [0, 0, 0])).toBeInstanceOf(Collector);
    expect(byPath(dataSource, [1])).toBeInstanceOf(FilterTransform);
    expect(byPath(dataSource, [1, 0])).toBeInstanceOf(Collector);
});

test("Nested data sources", () => {
    const root = create({
        data: { values: [1] },
        transform: [{ type: "filter", expr: "datum.data > 0" }],
        layer: [
            {
                data: { sequence: { start: 0, stop: 5 } },
                transform: [{ type: "formula", expr: "3", as: "foo" }],
                mark
            }
        ]
    });

    const dataSources = buildDataFlow(root).dataSources;

    expect(dataSources[0]).toBeInstanceOf(InlineSource);
    expect(dataSources[0].children[0]).toBeInstanceOf(FilterTransform);
    expect(dataSources[0].children[0].children.length).toEqual(0);

    expect(byPath(dataSources[1], [])).toBeInstanceOf(SequenceSource);
    expect(byPath(dataSources[1], [0])).toBeInstanceOf(CloneTransform);
    expect(byPath(dataSources[1], [0, 0])).toBeInstanceOf(FormulaTransform);
    expect(byPath(dataSources[1], [0, 0, 0])).toBeInstanceOf(Collector);
});
