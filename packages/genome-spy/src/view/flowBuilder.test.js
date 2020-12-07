import Collector from "../data/collector";
import FlowNode from "../data/flowNode";
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
    expect(dataSource.children[0]).toBeInstanceOf(InlineSource);
    expect(dataSource.children[0].children[0]).toBeInstanceOf(Collector);
});
