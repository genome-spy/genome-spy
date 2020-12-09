/**
 * @typedef {import("./flowNode").default} FlowNode
 */

import { BEHAVIOR_CLONES, BEHAVIOR_MODIFIES } from "./flowNode";
import CloneTransform from "./transforms/clone";

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
