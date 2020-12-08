import Collector from "../data/collector";
import FlowNode from "../data/flowNode";
import FilterTransform from "../data/flowTransforms/filter";
import FormulaTransform from "../data/flowTransforms/formula";
import InlineSource from "../data/sources/inlineSource";
import { buildDataFlow } from "./flowBuilder";
import { create } from "./testUtils";

/**
 *
 * @param {FlowNode} node
 * @param {number[]} path
 */
function getNodeByPath(node, path) {
    for (const elem of path) {
        node = node.children[elem];
    }
    return node;
}

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
        mark: "rect"
    });

    const dataSource = buildDataFlow(root)[0];

    expect(dataSource).toBeInstanceOf(InlineSource);
    expect(dataSource.children[0]).toBeInstanceOf(FormulaTransform);
    expect(dataSource.children[0].children[0]).toBeInstanceOf(Collector);
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
                mark: "rect"
            },
            {
                transform: [
                    {
                        type: "filter",
                        expr: "datum.data > 4"
                    }
                ],
                mark: "rect"
            }
        ]
    });

    const dataSource = buildDataFlow(root)[0];

    expect(dataSource).toBeInstanceOf(InlineSource);
    expect(dataSource.children[0]).toBeInstanceOf(FormulaTransform);
    expect(dataSource.children[0].children[0]).toBeInstanceOf(Collector);
    expect(dataSource.children[1]).toBeInstanceOf(FilterTransform);
    expect(dataSource.children[1].children[0]).toBeInstanceOf(Collector);
});
