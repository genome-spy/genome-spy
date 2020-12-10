/**
 *
 * @typedef {import("./sources/dataSource").default} DataSource
 * @typedef {import("./collector").default} Collector
 */

/**
 * @template H A key (string, object, whatever) that is used to retrieve
 *      data sources and collectors.
 */
export default class DataFlow {
    constructor() {
        /** @type {Map<H, DataSource>} */
        this.dataSourcesByHost = new Map();

        /** @type {Map<H, Collector>} */
        this.collectorsByHost = new Map();
    }

    get dataSources() {
        return [...new Set(this.dataSourcesByHost.values()).values()];
    }

    get collectors() {
        return [...this.collectorsByHost.values()];
    }

    /**
     *
     * @param {DataSource} dataSource
     * @param {H} key
     * @returns {DataSource} The newly added data source or an existing source with the
     *      same identifier.
     */
    addDataSource(dataSource, key) {
        // Merge identical sources
        const identifier = dataSource.identifier;
        if (identifier) {
            for (const existingSource of this.dataSources) {
                if (existingSource.identifier === identifier) {
                    existingSource.adoptChildrenOf(dataSource);
                    dataSource = existingSource;
                }
            }
        }

        this.dataSourcesByHost.set(key, dataSource);

        return dataSource;
    }

    /**
     *
     * @param {H} key
     */
    findDataSource(key) {
        return this.dataSourcesByHost.get(key);
    }

    /**
     *
     * @param {Collector} collector
     * @param {H} key
     */
    addCollector(collector, key) {
        this.collectorsByHost.set(key, collector);
    }

    /**
     *
     * @param {H} key
     */
    findCollector(key) {
        return this.collectorsByHost.get(key);
    }
}
