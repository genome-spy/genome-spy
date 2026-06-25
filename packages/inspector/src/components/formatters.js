/**
 * @param {Record<string, string>} record
 * @returns {string}
 */
export function formatRecord(record) {
    const entries = Object.entries(record);
    return entries.length
        ? entries.map(([channel, id]) => channel + ": " + id).join(", ")
        : "-";
}

/**
 * @param {{ disposed?: boolean, initialized?: boolean, completed?: boolean }} node
 * @returns {string}
 */
export function formatFlowNodeState(node) {
    if (node.disposed) {
        return "disposed";
    } else if (!node.initialized) {
        return "new";
    } else if (node.completed) {
        return "done";
    } else {
        return "active";
    }
}

/**
 * @param {any} value
 * @returns {string}
 */
export function formatValue(value) {
    if (value === undefined) {
        return "-";
    }

    return typeof value === "string" ? value : JSON.stringify(value);
}
