import { BEHAVIOR_CLONES, BEHAVIOR_COLLECTS } from "./flowNode.js";
import CloneTransform from "./transforms/clone.js";

/**
 * @param {import("./flowNode").default} node
 * @param {import("./flowNode").default} [parent]
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
 * @param {import("./flowNode").default} node
 */
export function removeRedundantCloneTransforms(node, cloneRequired = false) {
    if (node.behavior & BEHAVIOR_COLLECTS) {
        // If an object is modified downstream of a collector, it must be cloned
        cloneRequired = true;
    }

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
        // Clone transforms must be preserved at branches
        removeRedundantCloneTransforms(
            node.children[i],
            cloneRequired || n > 1
        );
    }
}

export function removeRedundantCollectors() {
    // TODO: Remove chained collectors, e.g., first collect and sort, then just collect
}

export function combineAndPullCollectorsUp() {
    // TODO:
}

// TODO: Combine identical branches to prevent redundant work
// Example:
//
//      --B--C--D
//     /
// --A----B--C--E
//     \
//      --F--G
//
// should become:
//
//              --D
//             /
// --A----B--C----E
//     \
//      --F--G

/**
 * @param {import("./dataFlow").default<any>} dataFlow
 */
export function combineIdenticalDataSources(dataFlow) {
    const dataSourceEntries = [...dataFlow._dataSourcesByHost.entries()];

    /** @type {Map<string, import("./sources/dataSource").default>} */
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
 * @param {import("./flowNode").default} root
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
