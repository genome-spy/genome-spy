/**
 * @typedef {object} FlowHandle
 * @prop {import("./sources/dataSource.js").default} [dataSource]
 * @prop {import("./collector.js").default} [collector]
 * @prop {Set<import("./collector.js").default>} [auxiliaryCollectors]
 * @prop {Set<import("./flowNode.js").default>} [terminals] Owned pipelines without a unit-view collector.
 * @prop {import("./flowNode.js").default} [node]
 */

/**
 * @param {FlowHandle} [handle]
 * @returns {FlowHandle}
 */
export function createFlowHandle(handle = {}) {
    return handle;
}
