import { group } from "d3-array";
import { BEHAVIOR_CLONES, BEHAVIOR_MODIFIES } from "./flowNode";
import CloneTransform from "./transforms/clone";

/**
 * @typedef {import("./flowNode").default} FlowNode
 * @typedef {import("./sources/dataSource").default} DataSource
 * @typedef {import("./dataFlow").default<any>} DataFlow
 */

/**
 * @param {FlowNode} node
 * @param {FlowNode} [parent]
 */
export function validateLinks(node, parent = undefined) {
    if (node.parent !== parent) {
        return false;
    }

    for (const child of node.children) {
        if (!validateLinks(child, node)) {
            return false;
        }
    }

    return true;
}

/**
 * Removes possible redundant CloneTransforms that were added during graph construction.
 *
 * @param {FlowNode} node
 */
export function removeRedundantCloneTransforms(node, cloneRequired = false) {
    if (node instanceof CloneTransform) {
        if (cloneRequired) {
            cloneRequired = false;
        } else {
            const child = node.children[0];
            node.excise();
            if (child) {
                removeRedundantCloneTransforms(child, cloneRequired);
            }
            return;
        }
    }

    if (node.behavior & BEHAVIOR_CLONES) {
        cloneRequired = false;
    }

    for (let i = 0, n = node.children.length; i < n; i++) {
        // All but the last branch need defensive copies to prevent side effects
        removeRedundantCloneTransforms(
            node.children[i],
            cloneRequired || i < n - 1
        );
    }
}

export function removeRedundantCollectors() {
    // TODO: Remove chained collectors, e.g., first collect and sort, then just collect
}

export function combineAndPullCollectorsUp() {
    // TODO:
}

/**
 * @param {import("./dataFlow").default<any>} dataFlow
 */
export function combineIdenticalDataSources(dataFlow) {
    const dataSourceEntries = [...dataFlow._dataSourcesByHost.entries()];

    /** @type {Map<string, DataSource>} */
    const sourcesByIdentifiers = new Map();
    for (const e of dataSourceEntries) {
        const ds = e[1];
        if (ds.identifier && !sourcesByIdentifiers.has(ds.identifier)) {
            sourcesByIdentifiers.set(ds.identifier, ds);
        }
    }

    dataFlow._dataSourcesByHost.clear();

    for (let [key, dataSource] of dataSourceEntries) {
        const target = sourcesByIdentifiers.get(dataSource.identifier);
        if (target) {
            target.adoptChildrenOf(dataSource);
            dataSource = target;
        }
        dataFlow.addDataSource(dataSource, key);
    }
}

/**
 *
 * @param {FlowNode} root
 */
export function optimizeFlowGraph(root) {
    removeRedundantCloneTransforms(root);
    if (!validateLinks(root)) {
        throw new Error(
            "Encountered a bug! There's a problem in the data flow structure."
        );
    }
}

/**
 * @param {import("./dataFlow").default<any>} dataFlow
 */
export function optimizeDataFlow(dataFlow) {
    for (const dataSource of dataFlow.dataSources) {
        optimizeFlowGraph(dataSource);
    }

    combineIdenticalDataSources(dataFlow);
}
