import templateResultToString from "../utils/templateResultToString.js";
import { listAgentActions } from "./actionCatalog.js";
import { buildViewTree } from "./viewTree.js";
import { getViewWorkflowContext } from "./viewWorkflowContext.js";

const SAMPLE_ATTRIBUTE = "SAMPLE_ATTRIBUTE";

/**
 * @param {import("../app.js").default} app
 * @returns {import("./types.js").AgentContext}
 */
export function getAgentContext(app) {
    const sampleView = app.getSampleView();
    const state = app.store.getState();
    const sampleState = app.provenance.getPresentState()?.sampleView;
    const provenance = app.provenance.getBookmarkableActionHistory() ?? [];
    const viewWorkflows = getViewWorkflowContext(app);
    const { root: viewRoot } = buildViewTree(app);
    const compactWorkflows =
        viewWorkflows.fields.length > 0
            ? {
                  fields: viewWorkflows.fields,
                  workflows: viewWorkflows.workflows,
              }
            : {
                  workflows: viewWorkflows.workflows,
              };

    return {
        schemaVersion: 1,
        sampleSummary: buildSampleSummary(sampleState),
        viewRoot,
        attributes: sampleView
            ? buildAttributeSummary(sampleView, sampleState)
            : [],
        actionCatalog: listAgentActions().map((entry) => ({
            actionType: entry.actionType,
            description: entry.description,
            payloadFields: entry.payloadFields,
            examplePayload: entry.examplePayload,
        })),
        viewWorkflows: compactWorkflows,
        provenance: buildProvenanceActions(app, provenance),
        lifecycle: {
            appInitialized: state.lifecycle.appInitialized,
        },
    };
}

/**
 * @param {any} sampleState
 * @returns {import("./types.js").AgentSampleSummary}
 */
function buildSampleSummary(sampleState) {
    const sampleCount = sampleState?.sampleData?.ids?.length ?? 0;
    const groupCount = countGroups(sampleState?.rootGroup);

    return {
        sampleCount,
        groupCount,
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
 * @param {import("../app.js").default} app
 * @param {import("@reduxjs/toolkit").Action[]} provenanceActions
 * @returns {import("./types.js").AgentProvenanceAction[]}
 */
function buildProvenanceActions(app, provenanceActions) {
    return provenanceActions.slice(-10).map((action) => {
        const info = app.provenance.getActionInfo(action);
        const title =
            info?.provenanceTitle ??
            info?.title ??
            action.type.replace("sampleView/", "");

        return {
            summary: templateResultToString(title),
            type: action.type,
            payload: /** @type {any} */ (action).payload,
            meta: /** @type {any} */ (action).meta,
            error: /** @type {any} */ (action).error,
        };
    });
}

/**
 * @param {any} group
 * @returns {number}
 */
function countGroups(group) {
    if (!group) {
        return 0;
    }

    if (!("groups" in group) || !Array.isArray(group.groups)) {
        return 1;
    }

    return (
        1 +
        group.groups.reduce(
            (/** @type {number} */ acc, /** @type {any} */ child) =>
                acc + countGroups(child),
            0
        )
    );
}
