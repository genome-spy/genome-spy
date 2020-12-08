import Collector from "../data/collector";
import createTransform from "../data/flowTransforms/transformFactory";
import createDataSource from "../data/sources/dataSourceFactory";
import UnitView from "./unitView";
import { createView } from "./viewUtils";

/**
 * @typedef {import("./view").default} View
 * @typedef {import("../data/flowNode").default<View>} FlowNode
 *
 * @param {View} root
 */
export function buildDataFlow(root) {
    /** @type {FlowNode[]} "Current nodes" on the path from view root to the current view */
    const nodeStack = [];

    /** @type {FlowNode} */
    let currentNode;

    /** @type {FlowNode[]} */
    const dataSources = [];

    /** @type {Collector[]} */
    const collectors = [];

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
            // TODO: If multiple UrlSources have identical url etc, merge them.
            const dataSource = createDataSource(
                view.spec.data,
                view.getBaseUrl()
            );

            // Give view an access to the data source to allow for dynamic updates
            view.dataSource = dataSource;

            dataSource.host = view;
            currentNode = dataSource;
            dataSources.push(dataSource);
        }

        if (view.spec.transform) {
            for (const params of view.spec.transform) {
                const transform = createTransform(params);
                transform.host = view;
                appendNode(
                    transform,
                    () =>
                        new Error(
                            `Cannot create a transform at ${
                                view.getPathString
                            } because no (inherited) data are available: ${JSON.stringify(
                                params
                            )}`
                        )
                );
            }
        }

        if (view instanceof UnitView) {
            const collector = new Collector();
            collector.host = view;
            appendNode(
                collector,
                () =>
                    new Error(
                        "A unit view has no (inherited) data source: " +
                            view.getPathString()
                    )
            );

            view.collector = collector;
            collectors.push(collector);
        }
    };

    /** @param {View} view */
    processView.afterChildren = view => {
        currentNode = nodeStack.pop();
    };

    root.visit(processView);

    return {
        dataSources,
        collectors
    };
}
