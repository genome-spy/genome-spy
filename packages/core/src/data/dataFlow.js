import NamedSource from "./sources/namedSource";

/**
 * @template H A key (string, object, whatever) that is used to retrieve
 *      data sources and collectors.
 */
export default class DataFlow {
    constructor() {
        /** @type {Map<H, import("./sources/dataSource").default>} */
        this._dataSourcesByHost = new Map();

        /** @type {Map<H, import("./collector").default>} */
        this._collectorsByHost = new Map();

        /** @type {Map<H, (function(import("./collector").default):void)[]>} */
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
     * @param {function(import("./collector").default):void} callback
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
     * @param {import("./collector").default} collector
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
     * @param {import("./sources/dataSource").default} dataSource
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
        /** @type {NamedSource} */
        let namedSource;
        /** @type {H[]} */
        let hosts = [];

        // Note: If a named sources with the same name are present at multiple locations in the
        // view hierarchy, the should actually be exactly the same instance. It's arranged that
        // way in the data flow optimization phase.

        for (const [host, dataSource] of this._dataSourcesByHost.entries()) {
            if (dataSource instanceof NamedSource) {
                if (name == dataSource.identifier) {
                    if (namedSource && namedSource !== dataSource) {
                        // TODO: Write a test case for this and remove the runtime check.
                        throw new Error(
                            `Found multiple instances of named data: ${name}. Data flow optimization is broken (it's a bug).`
                        );
                    }
                    namedSource = dataSource;
                    hosts.push(host);
                }
            }
        }

        if (namedSource) {
            return {
                dataSource: namedSource,
                hosts,
            };
        }
    }

    /**
     *
     * @param {import("./collector").default} collector
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
