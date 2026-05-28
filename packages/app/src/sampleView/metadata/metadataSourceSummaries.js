import {
    createMetadataSourceAdapter,
    resolveMetadataSources,
} from "./metadataSourceAdapters.js";
import { getEffectiveInitialLoad } from "./metadataSourceInitialLoad.js";

const DEFAULT_MAX_EXAMPLES = 3;

/**
 * @typedef {import("@genome-spy/app/spec/sampleView.js").MetadataDef} MetadataDef
 * @typedef {import("@genome-spy/app/spec/sampleView.js").MetadataSourceDef} MetadataSourceDef
 * @typedef {import("@genome-spy/app/agentApi").AgentMetadataSourceSummary} AgentMetadataSourceSummary
 * @typedef {import("@genome-spy/app/agentApi").AgentMetadataSourceIdentifierSummary} AgentMetadataSourceIdentifierSummary
 */

/**
 * @param {MetadataDef | undefined} metadataDef
 * @param {{
 *   baseUrl?: string;
 *   signal?: AbortSignal;
 *   maxExamples?: number;
 * }} [options]
 * @returns {Promise<AgentMetadataSourceSummary[]>}
 */
export async function buildMetadataSourceSummaries(metadataDef, options = {}) {
    const sources = await resolveMetadataSources(metadataDef, {
        baseUrl: options.baseUrl,
        signal: options.signal,
    });

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
 *   baseUrl?: string;
 *   signal?: AbortSignal;
 *   maxExamples?: number;
 * }} options
 * @returns {Promise<AgentMetadataSourceSummary>}
 */
async function summarizeMetadataSource(source, options) {
    const adapter = createMetadataSourceAdapter(source, {
        baseUrl: options.baseUrl,
    });
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
