import templateResultToString from "../utils/templateResultToString.js";
import { listAgentActions } from "./actionCatalog.js";
import { listAgentTools } from "./toolCatalog.js";
import { buildViewTree } from "./viewTree.js";
import { getSelectionAggregationContext } from "./selectionAggregationContext.js";
import { isBaselineAction } from "../state/provenanceBaseline.js";
import { getEncodingSearchFields } from "@genome-spy/core/encoder/metadataChannels.js";
import { getViewSelector } from "@genome-spy/core/view/viewSelectors.js";

const SAMPLE_ATTRIBUTE = "SAMPLE_ATTRIBUTE";

/**
 * Cache derived searchable-view summaries by view instance.
 * The summary includes field examples and datum field names, so we only want
 * to scan the collector data once per view object.
 * @type {WeakMap<object, import("./types.js").AgentSearchableViewSummary>}
 */
const searchableViewSummaryCache = new WeakMap();

/**
 * @param {import("../app.js").default} app
 * @param {import("./types.js").AgentContextOptions} [options]
 * @returns {import("./types.js").AgentContext}
 */
export function getAgentContext(app, options = {}) {
    const sampleView = app.getSampleView();
    const sampleHierarchy = app.provenance.getPresentState()?.sampleView;
    const provenance = app.provenance.getActionHistory() ?? [];
    const selectionAggregation = getSelectionAggregationContext(app);
    const { root: viewRoot } = buildViewTree(app, options);
    const actionCatalog = listAgentActions();
    const searchableViews = buildSearchableViews(app);

    return {
        schemaVersion: 1,
        actionCatalog: actionCatalog.map((entry) => ({
            actionType: entry.actionType,
            description: entry.description,
            payloadFields: entry.payloadFields,
            examplePayload: entry.examplePayload,
        })),
        toolCatalog: listAgentTools().map((entry) => ({
            toolName: entry.toolName,
            description: entry.description,
            inputType: entry.inputType,
            inputFields: entry.inputFields,
            exampleInput: entry.exampleInput,
        })),
        attributes: sampleView
            ? buildAttributeSummary(sampleView, sampleHierarchy)
            : [],
        searchableViews,
        selectionAggregation,
        provenance: buildProvenanceActions(app, provenance),
        sampleSummary: buildSampleSummary(sampleHierarchy),
        sampleGroupLevels: sampleView
            ? buildSampleGroupLevels(sampleView, sampleHierarchy)
            : [],
        viewRoot,
    };
}

/**
 * @param {import("../sampleView/state/sampleState.js").SampleHierarchy} sampleHierarchy
 * @returns {import("./types.js").AgentSampleSummary}
 */
function buildSampleSummary(sampleHierarchy) {
    const sampleCount = sampleHierarchy.sampleData.ids.length;
    const groupCount = sampleHierarchy.groupMetadata.length;
    const visibleSampleCount = countVisibleSamples(sampleHierarchy?.rootGroup);

    return {
        sampleCount,
        groupCount,
        visibleSampleCount,
    };
}

/**
 * @param {import("../sampleView/sampleView.js").default} sampleView
 * @param {import("../sampleView/state/sampleState.js").SampleHierarchy} sampleHierarchy
 * @returns {import("./types.js").AgentAttributeSummary[]}
 */
function buildAttributeSummary(sampleView, sampleHierarchy) {
    const { attributeNames, attributeDefs } = sampleHierarchy.sampleMetadata;

    const getAttributeInfo = (
        /** @type {import("../sampleView/types.js").AttributeIdentifier} */ attributeIdentifier
    ) =>
        sampleView.compositeAttributeInfoSource.getAttributeInfo(
            attributeIdentifier
        );

    return attributeNames.map((/** @type {string} */ name) => {
        const info = getAttributeInfo({
            type: SAMPLE_ATTRIBUTE,
            specifier: name,
        });

        const def = attributeDefs[name] ?? {};

        return {
            id: info.attribute,
            title: templateResultToString(info.title),
            description: info.description,
            dataType: info.type,
            visible: def.visible === false ? false : undefined,
        };
    });
}

/**
 * @param {import("../sampleView/sampleView.js").default} sampleView
 * @param {import("../sampleView/state/sampleState.js").SampleHierarchy} sampleHierarchy
 * @returns {import("./types.js").AgentSampleGroupLevel[]}
 */
function buildSampleGroupLevels(sampleView, sampleHierarchy) {
    const groupMetadata = sampleHierarchy.groupMetadata;

    return groupMetadata.map((entry, level) => {
        const info = sampleView.compositeAttributeInfoSource.getAttributeInfo(
            entry.attribute
        );

        return {
            level,
            attribute: entry.attribute,
            title: templateResultToString(info.title),
        };
    });
}

/**
 * @param {import("../app.js").default} app
 * @returns {import("./types.js").AgentSearchableViewSummary[]}
 */
function buildSearchableViews(app) {
    const searchableViews = app.genomeSpy.getSearchableViews();

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

/**
 * @param {import("../app.js").default} app
 * @param {import("@reduxjs/toolkit").Action[]} provenanceActions
 * @returns {import("./types.js").AgentProvenanceAction[]}
 */
function buildProvenanceActions(app, provenanceActions) {
    return provenanceActions
        .filter((action) => !isBaselineAction(action))
        .slice(-10)
        .map((action) => {
            const info = app.provenance.getActionInfo(action);
            const title =
                info?.provenanceTitle ??
                info?.title ??
                action.type.replace("sampleView/", "");

            return {
                summary: templateResultToString(title),
                provenanceId: /** @type {any} */ (action).provenanceId,
                type: action.type,
                payload: /** @type {any} */ (action).payload,
                meta: /** @type {any} */ (action).meta,
                error: /** @type {any} */ (action).error,
            };
        });
}

/**
 * @param {any} group
 * @param {Set<string>} [sampleIds]
 * @returns {number}
 */
function countVisibleSamples(group, sampleIds = new Set()) {
    if (!group) {
        return 0;
    }

    if ("samples" in group) {
        for (const sampleId of group.samples) {
            sampleIds.add(sampleId);
        }

        return sampleIds.size;
    }

    for (const child of group.groups) {
        countVisibleSamples(child, sampleIds);
    }

    return sampleIds.size;
}
