import {
    createMetadataSourceAdapter,
    resolveMetadataSourceFromSources,
    resolveMetadataSources,
} from "./metadataSourceAdapters.js";
import { buildMetadataSourceSummaries } from "./metadataSourceSummaries.js";

/** @type {WeakMap<object, MetadataSourceRuntime>} */
const runtimeBySampleView = new WeakMap();

/**
 * @typedef {import("@genome-spy/app/spec/sampleView.js").MetadataSourceDef} MetadataSourceDef
 */

export class MetadataSourceRuntime {
    /** @type {import("../sampleView.js").default} */
    #sampleView;

    /** @type {import("./metadataSourceAdapters.js").MetadataSourceResolveOptions} */
    #resolveOptions;

    /** @type {Promise<MetadataSourceDef[]> | undefined} */
    #sourcesPromise;

    /** @type {Map<MetadataSourceDef, import("./metadataSourceAdapters.js").MetadataSourceAdapter>} */
    #adapterBySource = new Map();

    /** @type {Promise<import("@genome-spy/app/agentApi").AgentMetadataSourceSummary[]> | undefined} */
    #agentSummariesPromise;

    /**
     * @param {import("../sampleView.js").default} sampleView
     * @param {import("./metadataSourceAdapters.js").MetadataSourceResolveOptions} [resolveOptions]
     */
    constructor(sampleView, resolveOptions = {}) {
        this.#sampleView = sampleView;
        this.#resolveOptions = resolveOptions;
    }

    /**
     * @returns {Promise<MetadataSourceDef[]>}
     */
    getSources() {
        if (!this.#sourcesPromise) {
            const resolveOptions = { ...this.#resolveOptions };
            delete resolveOptions.signal;
            this.#sourcesPromise = resolveMetadataSources(
                this.#sampleView.spec.metadata,
                {
                    ...resolveOptions,
                    baseUrl:
                        this.#resolveOptions.baseUrl ??
                        this.#sampleView.getBaseUrl(),
                }
            ).catch((error) => {
                this.#sourcesPromise = undefined;
                throw error;
            });
        }

        return this.#sourcesPromise;
    }

    /**
     * @param {string | undefined} sourceId
     * @returns {Promise<MetadataSourceDef>}
     */
    async getSource(sourceId) {
        const sources = await this.getSources();
        return resolveMetadataSourceFromSources(sources, sourceId);
    }

    /**
     * @param {MetadataSourceDef} source
     */
    getAdapter(source) {
        let adapter = this.#adapterBySource.get(source);
        if (!adapter) {
            adapter = createMetadataSourceAdapter(source, {
                baseUrl:
                    this.#resolveOptions.baseUrl ??
                    this.#sampleView.getBaseUrl(),
            });
            this.#adapterBySource.set(source, adapter);
        }

        return adapter;
    }

    /**
     * @param {AbortSignal} [signal]
     * @returns {Promise<import("@genome-spy/app/agentApi").AgentMetadataSourceSummary[]>}
     */
    getAgentSummaries(signal) {
        if (!this.#agentSummariesPromise) {
            this.#agentSummariesPromise = this.getSources()
                .then((sources) =>
                    buildMetadataSourceSummaries(sources, {
                        getAdapter: (source) => this.getAdapter(source),
                        signal,
                    })
                )
                .catch((error) => {
                    this.#agentSummariesPromise = undefined;
                    throw error;
                });
        }

        return this.#agentSummariesPromise;
    }
}

/**
 * @param {import("../sampleView.js").default} sampleView
 * @param {import("./metadataSourceAdapters.js").MetadataSourceResolveOptions} [resolveOptions]
 * @returns {MetadataSourceRuntime}
 */
export function createMetadataSourceRuntime(sampleView, resolveOptions) {
    return new MetadataSourceRuntime(sampleView, resolveOptions);
}

/**
 * @param {import("../sampleView.js").default} sampleView
 * @returns {MetadataSourceRuntime}
 */
export function getMetadataSourceRuntime(sampleView) {
    let runtime = runtimeBySampleView.get(sampleView);
    if (!runtime) {
        runtime = createMetadataSourceRuntime(sampleView);
        runtimeBySampleView.set(sampleView, runtime);
    }

    return runtime;
}
