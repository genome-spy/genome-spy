/**
 * @typedef {object} FlowHandle
 * @prop {import("./sources/dataSource.js").default} [dataSource]
 * @prop {import("./collector.js").default} [collector]
 * @prop {function(import("./collector.js").default):void} [collectorObserver]
 */

/**
 * @param {FlowHandle} [handle]
 * @returns {FlowHandle}
 */
export function createFlowHandle(handle = {}) {
    return handle;
}
