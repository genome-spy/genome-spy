import { previewValue } from "./valuePreview.js";

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
