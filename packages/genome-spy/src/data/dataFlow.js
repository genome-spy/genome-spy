/**
 *
 * @typedef {import("./flowNode").default} FlowNode
 * @typedef {import("./collector").default} Collector
 */

/**
 * @template {object} H
 */
export default class DataFlow {
    constructor() {
        /** @type {FlowNode[]} */
        this.dataSources = [];

        /** @type {Collector[]} */
        this.collectors = [];

        /** @type {WeakMap<H, FlowNode>} */
        this.dataSourceHosts = new WeakMap();

        /** @type {WeakMap<H, Collector>} */
        this.collectorHosts = new WeakMap();
    }

    /**
     *
     * @param {FlowNode} dataSource
     * @param {H} host
     */
    addDataSource(dataSource, host) {
        this.dataSources.push(dataSource);
        this.dataSourceHosts.set(host, dataSource);
    }

    /**
     *
     * @param {H} host
     */
    findDataSourceForHost(host) {
        return this.dataSourceHosts.get(host);
    }

    /**
     *
     * @param {Collector} collector
     * @param {H} host
     */
    addCollector(collector, host) {
        this.collectors.push(collector);
        this.collectorHosts.set(host, collector);
    }

    /**
     *
     * @param {H} host
     */
    findCollectorForHost(host) {
        return this.collectorHosts.get(host);
    }
}
