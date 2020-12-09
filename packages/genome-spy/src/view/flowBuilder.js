import Collector from "../data/collector";
import createTransform from "../data/transforms/transformFactory";
import createDataSource from "../data/sources/dataSourceFactory";
import UnitView from "./unitView";
import { BEHAVIOR_MODIFIES } from "../data/flowNode";
import CloneTransform from "../data/transforms/clone";

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

    /**
     * @param {FlowNode} transform
     * @param {any} [params]
     */
    function appendTransform(transform, params) {
        appendNode(
            transform,
            () =>
                new Error(
                    `Cannot append a transform because no (inherited) data are available! ${
                        params ? JSON.stringify(params) : ""
                    }`
                )
        );
    }

    /**
     *
     * @param {import("../spec/transform").TransformConfig[]} transforms
     */
    function createTransforms(transforms) {
        for (const params of transforms) {
            const transform = createTransform(params);
            if (transform.behavior & BEHAVIOR_MODIFIES) {
                // Make defensive copies before every modifying transform to
                // ensure that modifications don't inadvertently become visible
                // in other branches of the flow.
                // These can be later optimized away where possible.
                appendTransform(new CloneTransform());
            }
            appendTransform(transform);
        }
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
            createTransforms(view.spec.transform);
        }

        if (view instanceof UnitView) {
            const collector = new Collector();
            appendNode(
                collector,
                () => new Error("A unit view has no (inherited) data source")
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
