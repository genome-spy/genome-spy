/** @typedef {import("./flowNode.js").default} FlowNode */

/**
 * Walks the actual optimized primary path and side inputs, not view ownership.
 * Shared inputs are visited once. This runs at batch boundaries, never per row.
 *
 * @param {FlowNode} output
 * @returns {Generator<FlowNode>}
 */
export function* iterateDataDependencies(output) {
    const pending = [output];
    /** @type {Set<FlowNode>} */
    const visited = new Set();
    while (pending.length) {
        const node = pending.pop();
        if (visited.has(node)) {
            continue;
        }
        visited.add(node);
        yield node;
        if (node.parent) {
            pending.push(node.parent);
        }
        pending.push(...node.dataDependencies);
    }
}

/**
 * Initial publication and current viewport coverage are distinct: omitting a
 * request checks publication only. Lazy sources retain their coverage policy.
 *
 * @param {FlowNode} output
 * @param {import("./sources/lazy/singleAxisLazySource.js").DataReadinessRequest} [request]
 */
export function isDataReady(output, request) {
    for (const node of iterateDataDependencies(output)) {
        if (!node.isDataReady()) {
            return false;
        }
        if (request && "isDataReadyForDomain" in node) {
            const source =
                /** @type {import("./sources/lazy/singleAxisLazySource.js").DataReadinessCheckable} */ (
                    node
                );
            if (!source.isDataReadyForDomain(request)) {
                return false;
            }
        }
    }
    return true;
}
