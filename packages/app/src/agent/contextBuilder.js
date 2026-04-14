import templateResultToString from "../utils/templateResultToString.js";
import { listAgentActions } from "./actionCatalog.js";
import { listAgentTools } from "./toolCatalog.js";
import { buildViewTree } from "./viewTree.js";
import { getSelectionAggregationContext } from "./selectionAggregationContext.js";
import { isBaselineAction } from "../state/provenanceBaseline.js";

const SAMPLE_ATTRIBUTE = "SAMPLE_ATTRIBUTE";

/**
 * @param {import("../app.js").default} app
 * @param {import("./types.js").AgentContextOptions} [options]
 * @returns {import("./types.js").AgentContext}
 */
export function getAgentContext(app, options = {}) {
    const sampleView = app.getSampleView();
    const state = app.store.getState();
    const sampleState = app.provenance.getPresentState()?.sampleView;
    const provenance = app.provenance.getActionHistory() ?? [];
    const selectionAggregation = getSelectionAggregationContext(app);
    const { root: viewRoot } = buildViewTree(app, options);
    const actionCatalog = listAgentActions();

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
            ? buildAttributeSummary(sampleView, sampleState)
            : [],
        selectionAggregation,
        provenance: buildProvenanceActions(app, provenance),
        sampleSummary: buildSampleSummary(sampleState),
        sampleGroupLevels: sampleView
            ? buildSampleGroupLevels(sampleView, sampleState)
            : [],
        lifecycle: {
            appInitialized: state.lifecycle.appInitialized,
        },
        viewRoot,
    };
}

/**
 * @param {any} sampleState
 * @returns {import("./types.js").AgentSampleSummary}
 */
function buildSampleSummary(sampleState) {
    const sampleCount = sampleState?.sampleData?.ids?.length ?? 0;
    const groupCount = sampleState?.groupMetadata?.length ?? 0;
    const visibleSampleCount = countVisibleSamples(sampleState?.rootGroup);

    return {
        sampleCount,
        groupCount,
        visibleSampleCount,
    };
}

/**
 * @param {import("../sampleView/sampleView.js").default} sampleView
 * @param {any} sampleState
 * @returns {import("./types.js").AgentAttributeSummary[]}
 */
function buildAttributeSummary(sampleView, sampleState) {
    const attributeNames = sampleState?.sampleMetadata?.attributeNames ?? [];
    const attributeDefs = sampleState?.sampleMetadata?.attributeDefs ?? {};
    const getAttributeInfo =
        sampleView.compositeAttributeInfoSource.getAttributeInfo.bind(
            sampleView.compositeAttributeInfoSource
        );

    return attributeNames.map((/** @type {string} */ name) => {
        const identifier = {
            type: SAMPLE_ATTRIBUTE,
            specifier: name,
        };
        const info = getAttributeInfo(identifier);
        const def = attributeDefs[name] ?? {};

        return {
            id: identifier,
            name,
            title: templateResultToString(info.title),
            description: info.description,
            dataType: info.type,
            source: SAMPLE_ATTRIBUTE,
            visible: def.visible === false ? false : undefined,
        };
    });
}

/**
 * @param {import("../sampleView/sampleView.js").default} sampleView
 * @param {any} sampleState
 * @returns {import("./types.js").AgentSampleGroupLevel[]}
 */
function buildSampleGroupLevels(sampleView, sampleState) {
    /** @type {Array<{ attribute: import("./types.js").AgentAttributeSummary["id"] }>} */
    const groupMetadata = sampleState?.groupMetadata ?? [];

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
