import LoadingStatusRegistry from "../genomeSpy/loadingStatusRegistry.js";
import DataSource from "./sources/dataSource.js";
import NamedSource from "./sources/namedSource.js";

/**
 * DataFlow holds data sources and collectors for optimization and initialization.
 */
export default class DataFlow {
    /** @type {Set<import("./sources/dataSource.js").default>} */
    #dataSources;

    /** @type {Set<import("./collector.js").default>} */
    #collectors;

    /**
     * Registry for per-view loading status. The host may replace this.
     *
     * @type {import("../genomeSpy/loadingStatusRegistry.js").default}
     */
    loadingStatusRegistry;

    constructor() {
        /** @type {Set<import("./sources/dataSource.js").default>} */
        this.#dataSources = new Set();

        /** @type {Set<import("./collector.js").default>} */
        this.#collectors = new Set();

        this.loadingStatusRegistry = new LoadingStatusRegistry();
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
        collector.observers.clear();
        this.#collectors.delete(collector);
    }

    /**
     * Prune a collector branch from the flow graph, removing empty ancestors.
     *
     * @param {import("./collector.js").default} collector
     */
    pruneCollectorBranch(collector) {
        let parent = collector.parent;
        if (parent) {
            parent.removeChild(collector);
        }

        while (parent && parent.children.length === 0) {
            const current = parent;
            parent = current.parent;
            if (parent) {
                parent.removeChild(current);
            } else if (current instanceof DataSource) {
                this.removeDataSource(current);
            }
        }
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

    // Initialization is handled by subtree helpers to avoid global init order.
}
