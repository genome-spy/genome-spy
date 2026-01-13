import { BEHAVIOR_CLONES, BEHAVIOR_COLLECTS } from "./flowNode.js";
import CloneTransform from "./transforms/clone.js";

/**
 * @param {import("./flowNode.js").default} node
 * @param {import("./flowNode.js").default} [parent]
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
 * @param {import("./flowNode.js").default} node
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
 * @param {import("./dataFlow.js").default<any>} dataFlow
 * @returns {Map<import("./sources/dataSource.js").default, import("./sources/dataSource.js").default>}
 */
export function combineIdenticalDataSources(dataFlow) {
    const dataSources = dataFlow.dataSources;

    /** @type {Map<string, import("./sources/dataSource.js").default>} */
    const sourcesByIdentifiers = new Map();
    for (const ds of dataSources) {
        if (ds.identifier && !sourcesByIdentifiers.has(ds.identifier)) {
            sourcesByIdentifiers.set(ds.identifier, ds);
        }
    }

    /** @type {Set<import("./sources/dataSource.js").default>} */
    const mergedSources = new Set();
    /** @type {Map<import("./sources/dataSource.js").default, import("./sources/dataSource.js").default>} */
    const canonicalBySource = new Map();

    for (const dataSource of dataSources) {
        if (dataSource.identifier) {
            const target = sourcesByIdentifiers.get(dataSource.identifier);
            if (target) {
                if (target !== dataSource) {
                    target.adoptChildrenOf(dataSource);
                }
                mergedSources.add(target);
                canonicalBySource.set(dataSource, target);
            }
        } else {
            mergedSources.add(dataSource);
            canonicalBySource.set(dataSource, dataSource);
        }
    }

    dataFlow.replaceDataSources(mergedSources);
    return canonicalBySource;
}

/**
 *
 * @param {import("./flowNode.js").default} root
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
 * @param {import("./dataFlow.js").default<any>} dataFlow
 * @returns {Map<import("./sources/dataSource.js").default, import("./sources/dataSource.js").default>}
 */
export function optimizeDataFlow(dataFlow) {
    const canonicalBySource = combineIdenticalDataSources(dataFlow);
    for (const dataSource of dataFlow.dataSources) {
        optimizeFlowGraph(dataSource);
    }
    return canonicalBySource;
}
