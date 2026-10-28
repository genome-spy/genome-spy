import { templateResultToString } from "@genome-spy/app/agentShared";
import { listAgentIntentActionSummaries } from "./actionCatalog.js";
import { buildViewTree } from "./viewTree.js";

/**
 * @typedef {import("@genome-spy/app/agentApi").AgentApi} AgentApi
 */

const SAMPLE_ATTRIBUTE = "SAMPLE_ATTRIBUTE";

/**
 * @param {AgentApi} agentApi
 * @param {import("./types.js").AgentContextOptions} [options]
 * @returns {Promise<import("./types.js").AgentContext>}
 */
export async function getAgentContext(agentApi, options = {}) {
    const sampleHierarchy = agentApi.getSampleHierarchy();
    const { root: viewRoot } = buildViewTree(agentApi, options);
    const intentActionSummaries = listAgentIntentActionSummaries();
    const searchableViews = buildSearchableViews(agentApi);
    const metadataSources = await buildMetadataSources(agentApi);

    return {
        schemaVersion: 1,
        intentActionSummaries,
        metadataSources,
        sampleAttributes: sampleHierarchy
            ? buildSampleAttributeSummary(agentApi, sampleHierarchy)
            : [],
        searchableViews,
        viewRoot,
    };
}

/**
 * @param {AgentApi} agentApi
 * @returns {Promise<import("./types.js").AgentMetadataSourceSummary[]>}
 */
async function buildMetadataSources(agentApi) {
    if (typeof agentApi.getMetadataSourceSummaries !== "function") {
        return [];
    }

    return agentApi.getMetadataSourceSummaries();
}

/**
 * @param {AgentApi} agentApi
 * @param {import("@genome-spy/app/agentShared").SampleHierarchy} sampleHierarchy
 * @returns {import("./types.js").AgentSampleAttributeSummary[]}
 */
function buildSampleAttributeSummary(agentApi, sampleHierarchy) {
    const { attributeNames, attributeDefs } = sampleHierarchy.sampleMetadata;

    return attributeNames.map((/** @type {string} */ name) => {
        const info = agentApi.getAttributeInfo({
            type: SAMPLE_ATTRIBUTE,
            specifier: name,
        });

        const def = attributeDefs[name] ?? {};

        return {
            specifier: name,
            title: getSampleAttributeTitle(info),
            description: info.description,
            dataType: info.type,
            semanticType: def.semanticType,
            visible: def.visible === false ? false : undefined,
        };
    });
}

/**
 * @param {import("@genome-spy/app/agentShared").AttributeInfo} info
 */
function getSampleAttributeTitle(info) {
    return info.shortTitle ?? templateResultToString(info.title);
}

/**
 * @param {AgentApi} agentApi
 * @returns {import("./types.js").AgentSearchableViewSummary[]}
 */
function buildSearchableViews(agentApi) {
    return agentApi
        .getDatumSearch()
        .listSearchableViews({ exampleLimit: 3 })
        .flatMap((summary) => {
            const selector = summary.view.selector;
            if (!selector) return [];
            return [
                {
                    selector,
                    title: summary.title,
                    description: summary.description,
                    searchFields: summary.fields,
                },
            ];
        });
}
