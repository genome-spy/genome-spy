/**
 * @typedef {object} FlowHandle
 * @prop {import("./sources/dataSource.js").default} [dataSource]
 * @prop {import("./collector.js").default} [collector]
 * @prop {import("./flowNode.js").default} [node]
 */

/**
 * @param {FlowHandle} [handle]
 * @returns {FlowHandle}
 */
export function createFlowHandle(handle = {}) {
    return handle;
}
