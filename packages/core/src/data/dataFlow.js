/**
 *
 * @typedef {import("./sources/dataSource").default} DataSource
 * @typedef {import("./collector").default} Collector
 */

import NamedSource from "./sources/namedSource";

/**
 * @template H A key (string, object, whatever) that is used to retrieve
 *      data sources and collectors.
 */
export default class DataFlow {
    constructor() {
        /** @type {Map<H, DataSource>} */
        this._dataSourcesByHost = new Map();

        /** @type {Map<H, Collector>} */
        this._collectorsByHost = new Map();

        /** @type {Map<H, (function(Collector):void)[]>} */
        this._observers = new Map();
    }

    get dataSources() {
        return [...new Set(this._dataSourcesByHost.values()).values()];
    }

    get collectors() {
        return [...this._collectorsByHost.values()];
    }

    /**
     * Adds a callback function that will be called when a collector has completed.
     *
     * @param {function(Collector):void} callback
     * @param {H} key
     */
    addObserver(callback, key) {
        let arr = this._observers.get(key);
        if (!arr) {
            arr = [];
            this._observers.set(key, arr);
        }

        arr.push(callback);
    }

    /**
     *
     * @param {Collector} collector
     * @param {H} key
     */
    _relayObserverCallback(collector, key) {
        const arr = this._observers.get(key);
        if (arr) {
            for (const callback of arr) {
                // eslint-disable-next-line callback-return
                callback(collector);
            }
        }
    }

    /**
     *
     * @param {DataSource} dataSource
     * @param {H} key
     */
    addDataSource(dataSource, key) {
        this._dataSourcesByHost.set(key, dataSource);
    }

    /**
     *
     * @param {H} key
     */
    findDataSourceByKey(key) {
        return this._dataSourcesByHost.get(key);
    }

    /**
     *
     * @param {string} name
     */
    findNamedDataSource(name) {
        for (const [host, dataSource] of this._dataSourcesByHost.entries()) {
            if (dataSource instanceof NamedSource) {
                if (name == dataSource.identifier) {
                    return {
                        host,
                        dataSource,
                    };
                }
            }
        }
    }

    /**
     *
     * @param {Collector} collector
     * @param {H} key
     */
    addCollector(collector, key) {
        this._collectorsByHost.set(key, collector);
        collector.observers.push((collector) =>
            this._relayObserverCallback(collector, key)
        );
    }

    /**
     *
     * @param {H} key
     */
    findCollectorByKey(key) {
        return this._collectorsByHost.get(key);
    }

    /**
     * Allows the flow nodes to perform final initialization after the flow
     * structure has been built and optimized.
     * Must be called before any data are to be propagated.
     */
    initialize() {
        for (const ds of this.dataSources) {
            ds.visit((node) => node.initialize());
        }
    }
}
