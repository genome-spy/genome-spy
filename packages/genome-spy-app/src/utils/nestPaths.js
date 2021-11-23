/**
 * @typedef {object} NestedItem
 * @prop {T} item
 * @prop {NestedItem<T>[]} children
 * @template T
 */

/**
 * @param {T[][]} paths
 * @returns {NestedItem<T>}
 * @template T
 */
export function nestPaths(paths) {
    if (!paths?.length) {
        throw new Error("Can't nest an empty array!");
    }

    /** @type {NestedItem<T>} */
    const fakeRoot = createNode(null);

    for (const path of paths) {
        if (!path?.length) {
            throw new Error("Cannot nest, element has no path!");
        }

        let prevNode = fakeRoot;

        for (const pathElement of path) {
            // O(slow) ... but perfectly fine for now.
            let node = prevNode.children.find(
                (nestedItem) => nestedItem.item === pathElement
            );
            if (!node) {
                node = createNode(pathElement);
                prevNode.children.push(node);
            }
            prevNode = node;
        }
    }
    return fakeRoot.children[0];
}

/**
 * @param {T} item
 * @returns {NestedItem<T>}
 * @template T
 */
const createNode = (item) => ({ item, children: [] });
