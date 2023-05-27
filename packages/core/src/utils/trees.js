/**
 * Takes an array of nodes that have parent references and turns them into a
 * tree of nodes. The original nodes are not modified, they are wrapped in a
 * new object. Uses a custom accessor for parent.
 *
 * @param {T[]} nodes
 * @param {(node: T) => T} parentAccessor
 * @template T
 * @returns {NodeWrapper<T>[]}
 */
export function nodesToTreesWithAccessor(nodes, parentAccessor) {
    /**
     * @typedef {object} NodeWrapper
     * @prop {T} ref
     * @prop {NodeWrapper<T>[]} children
     * @template T
     */

    /** @type {Map<T, NodeWrapper<T>>} */
    const nodeMap = new Map();
    const rootNodes = [];

    for (const node of nodes) {
        nodeMap.set(node, { ref: node, children: [] });
    }

    for (const nodeWrapper of nodeMap.values()) {
        const parent = nodeMap.get(parentAccessor(nodeWrapper.ref));
        if (parent) {
            parent.children.push(nodeWrapper);
        } else {
            rootNodes.push(nodeWrapper);
        }
    }

    return rootNodes;
}

/**
 * Takes an array of nodes that have parent references and turns them into a
 * tree of nodes. The original nodes are not modified, they are wrapped in a
 * new object.
 *
 * @param {T[]} nodes
 * @template {{ parent: T}} T
 */
export function nodesToTrees(nodes) {
    return nodesToTreesWithAccessor(nodes, (node) => node.parent);
}

/**
 * Visits a tree using depth-first search. Uses a custom accessor for children.
 *
 * @param {T} rootNode
 * @param {{ preOrder?: (node: T) => void, postOrder?: (node: T) => void}} visitor
 * @param {(node: T) => Iterable<T>} childrenAccessor
 * @template T
 */
export function visitTreeWithAccessor(rootNode, visitor, childrenAccessor) {
    visitor.preOrder?.(rootNode);

    for (const child of childrenAccessor(rootNode)) {
        visitTreeWithAccessor(child, visitor, childrenAccessor);
    }

    visitor.postOrder?.(rootNode);
}

/**
 * Visits a tree using depth-first search.
 *
 * @param {T} rootNode
 * @param {{ preOrder?: (node: T) => void, postOrder?: (node: T) => void}} visitor
 * @template {{ children: T[] }} T
 */
export function visitTree(rootNode, visitor) {
    visitTreeWithAccessor(rootNode, visitor, (node) => node.children);
}
