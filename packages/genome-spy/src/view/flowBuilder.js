import Collector from "../data/collector";
import createTransform from "../data/flowTransforms/transformFactory";
import createDataSource from "../data/sources/dataSourceFactory";
import { peek } from "../utils/arrayUtils";
import UnitView from "./unitView";

/**
 * @typedef {import("../data/flowNode").default} FlowNode
 * @typedef {import("./view").default} View
 *
 * @param {View} root
 */
export function buildDataFlow(root) {
    /** @type {FlowNode[]} "Current nodes" on the path to current view */
    const nodeStack = [];

    /** @type {FlowNode} */
    let currentNode;

    /** @type {FlowNode[]} */
    const dataSources = [];

    // TODO: FlowStack

    /**
     * @param {FlowNode} node
     * @param {function():Error} onMissingParent
     */
    function appendNode(node, onMissingParent) {
        if (!currentNode) {
            throw onMissingParent() ||
                new Error("Cannot append data flow node, no parent exist!");
        }
        currentNode.addChild(node);
        currentNode = node;
    }

    /** @param {View} view */
    const processView = view => {
        nodeStack.push(currentNode);

        if (view.spec.data) {
            const dataSource = createDataSource(
                view.spec.data,
                view.getBaseUrl()
            );
            currentNode = dataSource;
            dataSources.push(dataSource);
        }

        if (view.spec.transform) {
            for (const params of view.spec.transform) {
                const transform = createTransform(params);
                appendNode(
                    transform,
                    () =>
                        new Error(
                            "Cannot create a transform because no inherited data are available: " +
                                JSON.stringify(params)
                        )
                );
            }
        }

        if (view instanceof UnitView) {
            const collector = new Collector();
            appendNode(
                collector,
                () =>
                    new Error(
                        "A unit view has no (inherited) data source: " +
                            view.getPathString()
                    )
            );

            view.collector = collector;
        }
    };

    /** @param {View} view */
    processView.afterChildren = view => {
        //console.log("after" + view.getPathString());
        currentNode = nodeStack.pop();
    };

    root.visit(processView);

    return dataSources;
}
