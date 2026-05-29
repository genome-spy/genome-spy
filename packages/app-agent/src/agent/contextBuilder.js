import { templateResultToString } from "@genome-spy/app/agentShared";
import { getEncodingSearchFields } from "@genome-spy/core/encoder/metadataChannels.js";
import { getViewSelector } from "@genome-spy/core/view/viewSelectors.js";
import { listAgentIntentActionSummaries } from "./actionCatalog.js";
import { buildViewTree } from "./viewTree.js";

/**
 * @typedef {import("@genome-spy/app/agentApi").AgentApi} AgentApi
 */

const SAMPLE_ATTRIBUTE = "SAMPLE_ATTRIBUTE";

/**
 * Cache derived searchable-view summaries by view instance.
 * The summary includes field examples and datum field names, so we only want
 * to scan the collector data once per view object.
 * @type {WeakMap<object, import("./types.js").AgentSearchableViewSummary>}
 */
const searchableViewSummaryCache = new WeakMap();

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
    const searchableViews = agentApi.getSearchableViews();

    return searchableViews
        .map((view) => buildSearchableViewSummary(view))
        .filter((summary) => summary !== undefined);
}

/**
 * @param {any} view
 * @returns {import("./types.js").AgentSearchableViewSummary | undefined}
 */
function buildSearchableViewSummary(view) {
    const cached = searchableViewSummaryCache.get(view);
    if (cached) {
        return cached;
    }

    if (typeof view?.getSearchAccessors !== "function") {
        return undefined;
    }

    const searchAccessors = view.getSearchAccessors();
    if (searchAccessors.length === 0) {
        return undefined;
    }

    const selector = getViewSelectorOrUndefined(view);
    if (!selector) {
        return undefined;
    }

    const encoding = view.getEncoding();
    const searchFields = getEncodingSearchFields(encoding) ?? [];
    const searchFieldDefinitions = Array.isArray(encoding?.search)
        ? encoding.search
        : encoding?.search
          ? [encoding.search]
          : [];
    const collectorData = view.getCollector()?.getData() ?? [];
    const { searchFieldSummaries, dataFields } = collectSearchableViewMetadata(
        searchFields,
        searchFieldDefinitions,
        searchAccessors,
        collectorData,
        3
    );

    if (searchFieldSummaries.length === 0) {
        return undefined;
    }

    /** @type {import("./types.js").AgentSearchableViewSummary} */
    const summary = {
        selector,
        title: String(view.getTitleText?.() ?? view.name ?? "view"),
        description: normalizeDescription(view.spec?.description),
        searchFields: searchFieldSummaries,
        dataFields,
    };

    searchableViewSummaryCache.set(view, summary);
    return summary;
}

/**
 * @param {string[]} searchFields
 * @param {Array<{ description?: string | string[] }>} searchFieldDefinitions
 * @param {import("vega-util").AccessorFn[]} searchAccessors
 * @param {Iterable<any>} data
 * @param {number} maxExamples
 * @returns {{
 *     searchFieldSummaries: import("./types.d.ts").AgentSearchableFieldSummary[];
 *     dataFields: string[];
 * }}
 */
function collectSearchableViewMetadata(
    searchFields,
    searchFieldDefinitions,
    searchAccessors,
    data,
    maxExamples
) {
    /** @type {import("./types.d.ts").AgentSearchableFieldSummary[]} */
    const searchFieldSummaries = searchFields.map((field, index) => ({
        field,
        description: normalizeDescription(
            searchFieldDefinitions[index]?.description
        ),
        examples: /** @type {string[]} */ ([]),
    }));
    /** @type {Set<string>[]} */
    const exampleSets = searchFieldSummaries.map(() => new Set());
    /** @type {string[]} */
    const dataFields = [];
    /** @type {Set<string>} */
    const seenDataFields = new Set();

    for (const datum of data) {
        let allExampleListsFilled = true;
        if (datum && typeof datum === "object") {
            for (const field of /** @type {string[]} */ (Object.keys(datum))) {
                if (field.startsWith("_") || seenDataFields.has(field)) {
                    continue;
                }

                seenDataFields.add(field);
                dataFields.push(field);
            }
        }

        for (let index = 0; index < searchFieldSummaries.length; index += 1) {
            if (searchFieldSummaries[index].examples.length >= maxExamples) {
                continue;
            }

            const value = searchAccessors[index](datum);
            if (value === null || value === undefined) {
                allExampleListsFilled = false;
                continue;
            }

            const example = String(value);
            const seenExamples = exampleSets[index];
            if (seenExamples.has(example)) {
                allExampleListsFilled = false;
                continue;
            }

            seenExamples.add(example);
            searchFieldSummaries[index].examples.push(example);
            if (searchFieldSummaries[index].examples.length < maxExamples) {
                allExampleListsFilled = false;
            }
        }

        if (allExampleListsFilled) {
            break;
        }
    }

    return {
        searchFieldSummaries,
        dataFields,
    };
}

/**
 * @param {string | string[] | undefined} description
 * @returns {string | undefined}
 */
function normalizeDescription(description) {
    if (typeof description === "string") {
        return description;
    }

    if (Array.isArray(description)) {
        return description.join("\n");
    }

    return undefined;
}

/**
 * @param {any} view
 * @returns {import("@genome-spy/core/view/viewSelectors.js").ViewSelector | undefined}
 */
function getViewSelectorOrUndefined(view) {
    try {
        return getViewSelector(view);
    } catch {
        return undefined;
    }
}
