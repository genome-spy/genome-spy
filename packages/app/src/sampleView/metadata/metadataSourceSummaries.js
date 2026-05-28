import { getEffectiveInitialLoad } from "./metadataSourceInitialLoad.js";

const DEFAULT_MAX_EXAMPLES = 3;

/**
 * @typedef {import("@genome-spy/app/spec/sampleView.js").MetadataSourceDef} MetadataSourceDef
 * @typedef {import("@genome-spy/app/agentApi").AgentMetadataSourceSummary} AgentMetadataSourceSummary
 * @typedef {import("@genome-spy/app/agentApi").AgentMetadataSourceIdentifierSummary} AgentMetadataSourceIdentifierSummary
 */

/**
 * @param {MetadataSourceDef[]} sources
 * @param {{
 *   signal?: AbortSignal;
 *   maxExamples?: number;
 *   getAdapter?: (source: MetadataSourceDef) => import("./metadataSourceAdapters.js").MetadataSourceAdapter;
 * }} [options]
 * @returns {Promise<AgentMetadataSourceSummary[]>}
 */
export async function buildMetadataSourceSummaries(sources, options = {}) {
    const lazySources = sources.filter(
        (source) => getEffectiveInitialLoad(source) === false
    );

    return Promise.all(
        lazySources.map((source) => summarizeMetadataSource(source, options))
    );
}

/**
 * @param {MetadataSourceDef} source
 * @param {{
 *   signal?: AbortSignal;
 *   maxExamples?: number;
 *   getAdapter?: (source: MetadataSourceDef) => import("./metadataSourceAdapters.js").MetadataSourceAdapter;
 * }} options
 * @returns {Promise<AgentMetadataSourceSummary>}
 */
async function summarizeMetadataSource(source, options) {
    if (!options.getAdapter) {
        throw new Error("Metadata source summary adapter is required.");
    }

    const adapter = options.getAdapter(source);
    const identifiers = await adapter.listIdentifierExamples(
        options.maxExamples ?? DEFAULT_MAX_EXAMPLES,
        options.signal
    );

    return compactObject({
        sourceId: source.id,
        name: source.name,
        description: source.description,
        attributeDefaults: summarizeAttributeDefaults(source),
        identifiers,
    });
}

/**
 * @param {MetadataSourceDef} source
 */
function summarizeAttributeDefaults(source) {
    const defaults = source.attributes?.[""];
    if (!defaults) {
        return undefined;
    }

    return compactObject({
        dataType: defaults.type,
        description: defaults.description,
    });
}

/**
 * @template {Record<string, any>} T
 * @param {T} object
 * @returns {T}
 */
function compactObject(object) {
    return /** @type {T} */ (
        Object.fromEntries(
            Object.entries(object).filter(([, value]) => value !== undefined)
        )
    );
}
