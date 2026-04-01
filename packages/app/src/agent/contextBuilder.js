import templateResultToString from "../utils/templateResultToString.js";
import { listAgentActions } from "./actionCatalog.js";
import generatedActionSummariesJson from "./generatedActionSummaries.json" with { type: "json" };
import { getViewWorkflowContext } from "./viewWorkflowContext.js";

const SAMPLE_ATTRIBUTE = "SAMPLE_ATTRIBUTE";

const generatedActionSummaries =
    /** @type {import("./types.js").AgentActionSummary[]} */ (
        generatedActionSummariesJson
    );

/**
 * @param {import("../app.js").default} app
 * @returns {import("./types.js").AgentContext}
 */
export function getAgentContext(app) {
    const sampleView = app.getSampleView();
    const state = app.store.getState();
    const sampleState = app.provenance.getPresentState()?.sampleView;
    const paramEntries =
        app.provenance.getPresentState()?.paramProvenance?.entries ?? {};
    const provenance = app.provenance.getBookmarkableActionHistory() ?? [];

    return {
        schemaVersion: 1,
        view: buildViewSummary(sampleView, sampleState),
        attributes: sampleView
            ? buildAttributeSummary(sampleView, sampleState)
            : [],
        actionCatalog: listAgentActions(),
        actionSummaries: generatedActionSummaries,
        viewWorkflows: getViewWorkflowContext(app),
        provenance: buildProvenanceActions(app, provenance),
        params: Object.entries(paramEntries).map(([key, entry]) => ({
            key,
            selector: entry.selector,
            value: entry.value,
        })),
        lifecycle: {
            appInitialized: state.lifecycle.appInitialized,
        },
    };
}

/**
 * @param {import("../sampleView/sampleView.js").default | undefined} sampleView
 * @param {any} sampleState
 * @returns {import("./types.js").AgentViewSummary}
 */
function buildViewSummary(sampleView, sampleState) {
    const sampleCount = sampleState?.sampleData?.ids?.length ?? 0;
    const attributeCount =
        sampleState?.sampleMetadata?.attributeNames?.length ?? 0;
    const groupCount = countGroups(sampleState?.rootGroup);

    return {
        type: sampleView ? "sampleView" : "unknown",
        name: sampleView?.name ?? "unknown",
        title: String(
            sampleView?.getTitleText?.() ?? sampleView?.name ?? "Sample View"
        ),
        sampleCount,
        attributeCount,
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
            dataType: info.type,
            source: SAMPLE_ATTRIBUTE,
            visible: def.visible ?? true,
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
