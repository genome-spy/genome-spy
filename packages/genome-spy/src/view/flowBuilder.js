import Collector from "../data/collector";
import createTransform from "../data/flowTransforms/transformFactory";
import createDataSource from "../data/sources/dataSourceFactory";
import { peek } from "../utils/arrayUtils";
import UnitView from "./unitView";

/**
 * @typedef {import("../data/flowNode").default} FlowNode
 * @typedef {import("./view").default} View
 * @param {View} root
 */
export function buildDataFlow(root) {
    /** @type {View[]} */
    const viewStack = [];

    /** @type {FlowNode[]} */
    const nodeStack = [];

    /** @type {FlowNode[]} */
    const dataSources = [];

    // TODO: FlowStack

    /** @param {View} view */
    const processView = view => {
        viewStack.push(view);

        if (view.spec.data) {
            const dataSource = createDataSource(view.spec.data);
            nodeStack.push(dataSource);
            dataSources.push(dataSource);
        }

        if (view.spec.transform) {
            for (const params of view.spec.transform) {
                const transform = createTransform(params);
                const previousNode = peek(nodeStack);
                if (!previousNode) {
                    throw new Error(
                        "Cannot create a transform because no inherited data are available: " +
                            JSON.stringify(params)
                    );
                }
                previousNode.addChild(transform);
            }
        }

        if (view instanceof UnitView) {
            const collector = new Collector();
            const previousNode = peek(nodeStack);
            if (!previousNode) {
                throw new Error(
                    "A unit view has no (inherited) data source: " +
                        view.getPathString()
                );
            }
            previousNode.addChild(collector);
        }
    };

    /** @param {View} view */
    processView.afterChildren = view => {
        viewStack.pop();
    };

    root.visit(processView);

    return dataSources;
}
