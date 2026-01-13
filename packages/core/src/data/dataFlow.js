import NamedSource from "./sources/namedSource.js";

/**
 * DataFlow holds data sources and collectors for optimization and initialization.
 */
export default class DataFlow {
    /** @type {Set<import("./sources/dataSource.js").default>} */
    #dataSources;

    /** @type {Set<import("./collector.js").default>} */
    #collectors;

    constructor() {
        /** @type {Set<import("./sources/dataSource.js").default>} */
        this.#dataSources = new Set();

        /** @type {Set<import("./collector.js").default>} */
        this.#collectors = new Set();
    }

    get dataSources() {
        return [...this.#dataSources];
    }

    get collectors() {
        return [...this.#collectors];
    }

    /**
     * @param {Iterable<import("./sources/dataSource.js").default>} dataSources
     */
    replaceDataSources(dataSources) {
        this.#dataSources = new Set(dataSources);
    }

    /**
     * @param {import("./sources/dataSource.js").default} dataSource
     */
    addDataSource(dataSource) {
        this.#dataSources.add(dataSource);
    }

    /**
     * @param {import("./sources/dataSource.js").default} dataSource
     */
    removeDataSource(dataSource) {
        this.#dataSources.delete(dataSource);
    }

    /**
     * @param {import("./collector.js").default} collector
     */
    addCollector(collector) {
        this.#collectors.add(collector);
    }

    /**
     * @param {import("./collector.js").default} collector
     */
    removeCollector(collector) {
        collector.observers.length = 0;
        this.#collectors.delete(collector);
    }

    /**
     * @param {string} name
     */
    findNamedDataSource(name) {
        /** @type {NamedSource} */
        let namedSource;

        // Note: If named sources with the same name are present at multiple locations in the
        // view hierarchy, they should actually be exactly the same instance.
        for (const dataSource of this.#dataSources.values()) {
            if (dataSource instanceof NamedSource) {
                if (name == dataSource.identifier) {
                    if (namedSource && namedSource !== dataSource) {
                        // TODO: Write a test case for this and remove the runtime check.
                        throw new Error(
                            `Found multiple instances of named data: ${name}. Data flow optimization is broken (it's a bug).`
                        );
                    }
                    namedSource = dataSource;
                }
            }
        }

        if (namedSource) {
            return {
                dataSource: namedSource,
            };
        }
    }

    /**
     * Adds a callback function that will be called when a collector has completed.
     *
     * @param {import("./collector.js").default} collector
     * @param {function(import("./collector.js").default):void} callback
     * @param {import("./flowHandle.js").FlowHandle} [handle]
     */
    addObserver(collector, callback, handle) {
        collector.observers.push(callback);
        if (handle) {
            handle.collectorObserver = callback;
        }
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
