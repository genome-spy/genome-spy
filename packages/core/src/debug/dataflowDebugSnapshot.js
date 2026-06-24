/**
 * @typedef {object} DataflowDebugSnapshotOptions
 * @prop {(object: object) => string} getDebugId
 */

/**
 * @typedef {object} DataflowDebugSnapshot
 * @prop {string[]} sourceIds
 * @prop {DataflowDebugNode[]} nodes
 * @prop {number} collectorCount
 */

/**
 * @typedef {object} DataflowDebugNode
 * @prop {string} id
 * @prop {string | undefined} parentId
 * @prop {string[]} childIds
 * @prop {string} label
 * @prop {number} count
 * @prop {Record<string, any> | null} first
 * @prop {boolean} completed
 * @prop {boolean} initialized
 * @prop {boolean} disposed
 * @prop {Record<string, any> | undefined} params
 * @prop {string | undefined} viewId
 * @prop {string | undefined} viewPath
 * @prop {string[]} domainSensitiveScaleChannels
 */

const MAX_PREVIEW_DEPTH = 3;
const MAX_PREVIEW_KEYS = 12;
const MAX_PREVIEW_ITEMS = 8;
const MAX_PREVIEW_STRING_LENGTH = 160;

/**
 * @param {import("../data/dataFlow.js").default | undefined} dataFlow
 * @param {DataflowDebugSnapshotOptions} options
 * @returns {DataflowDebugSnapshot}
 */
export function createDataflowDebugSnapshot(dataFlow, options) {
    if (!dataFlow) {
        return {
            sourceIds: [],
            nodes: [],
            collectorCount: 0,
        };
    }

    /** @type {DataflowDebugNode[]} */
    const nodes = [];
    /** @type {string[]} */
    const sourceIds = [];
    const seen = new Set();

    for (const source of dataFlow.dataSources) {
        const node = visitFlowNode(source, undefined, options, nodes, seen);
        sourceIds.push(node.id);
    }

    return {
        sourceIds,
        nodes,
        collectorCount: dataFlow.collectors.length,
    };
}

/**
 * @param {import("../data/flowNode.js").default} flowNode
 * @param {string | undefined} parentId
 * @param {DataflowDebugSnapshotOptions} options
 * @param {DataflowDebugNode[]} nodes
 * @param {Set<object>} seen
 * @returns {DataflowDebugNode}
 */
function visitFlowNode(flowNode, parentId, options, nodes, seen) {
    const id = options.getDebugId(flowNode);
    if (seen.has(flowNode)) {
        const existing = nodes.find((node) => node.id === id);
        if (!existing) {
            throw new Error("Seen flow node missing from debug snapshot.");
        }
        return existing;
    }

    seen.add(flowNode);
    const state = flowNode.getDebugState();
    /** @type {string[]} */
    const childIds = [];
    const node = {
        id,
        parentId,
        childIds,
        label: state.label,
        count: state.stats.count,
        first: previewValue(state.stats.first),
        completed: state.completed,
        initialized: state.initialized,
        disposed: state.disposed,
        params: state.params ? previewValue(state.params) : undefined,
        viewId: state.view ? options.getDebugId(state.view) : undefined,
        viewPath: state.view ? state.view.getPathString() : undefined,
        domainSensitiveScaleChannels: state.domainSensitiveScaleChannels,
    };
    nodes.push(node);

    for (const child of state.children) {
        const childNode = visitFlowNode(child, id, options, nodes, seen);
        node.childIds.push(childNode.id);
    }

    return node;
}

/**
 * @param {any} value
 * @param {number} [depth]
 * @returns {any}
 */
function previewValue(value, depth = 0) {
    if (value == null || typeof value !== "object") {
        return previewScalar(value);
    }

    if (depth >= MAX_PREVIEW_DEPTH) {
        return Array.isArray(value)
            ? `[Array(${value.length})]`
            : `[Object(${Object.keys(value).length})]`;
    }

    if (Array.isArray(value)) {
        const preview = value
            .slice(0, MAX_PREVIEW_ITEMS)
            .map((item) => previewValue(item, depth + 1));
        if (value.length > MAX_PREVIEW_ITEMS) {
            preview.push(`... ${value.length - MAX_PREVIEW_ITEMS} more items`);
        }
        return preview;
    }

    /** @type {Record<string, any>} */
    const preview = {};
    const record = /** @type {Record<string, any>} */ (value);
    const keys = Object.keys(record);
    for (const key of keys.slice(0, MAX_PREVIEW_KEYS)) {
        preview[key] = previewValue(record[key], depth + 1);
    }
    if (keys.length > MAX_PREVIEW_KEYS) {
        preview["..."] = `${keys.length - MAX_PREVIEW_KEYS} more keys`;
    }
    return preview;
}

/**
 * @param {any} value
 * @returns {any}
 */
function previewScalar(value) {
    if (typeof value === "string" && value.length > MAX_PREVIEW_STRING_LENGTH) {
        return value.slice(0, MAX_PREVIEW_STRING_LENGTH) + "...";
    }

    return value;
}
