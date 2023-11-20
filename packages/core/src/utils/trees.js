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
     * @template T
     * @typedef {object} NodeWrapper
     * @prop {T} ref
     * @prop {NodeWrapper<T>[]} children
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
 * @param {{ preOrder?: (node: T) => VisitResult, postOrder?: (node: T) => VisitResult }} visitor
 * @param {(node: T) => Iterable<T>} childrenAccessor
 * @returns {VisitResult}
 * @template T
 */
export function visitTreeWithAccessor(rootNode, visitor, childrenAccessor) {
    /** @typedef {"skip" | "stop" | void} VisitResult */
    const preResult = visitor.preOrder?.(rootNode);
    if (preResult) {
        return preResult;
    }

    for (const child of childrenAccessor(rootNode)) {
        const childResult = visitTreeWithAccessor(
            child,
            visitor,
            childrenAccessor
        );
        if (childResult === "stop") {
            return childResult;
        }
    }

    return visitor.postOrder?.(rootNode);
}

/**
 * Visits a tree using depth-first search.
 *
 * @param {T} rootNode
 * @param {{ preOrder?: (node: T) => VisitResult, postOrder?: (node: T) => VisitResult }} visitor
 * @returns {VisitResult}
 * @template {{ children: T[] }} T
 */
export function visitTree(rootNode, visitor) {
    /** @typedef {"skip" | "stop" | void} VisitResult */
    return visitTreeWithAccessor(rootNode, visitor, (node) => node.children);
}
