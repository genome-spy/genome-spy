import { resolveParamSelector } from "@genome-spy/core/view/viewSelectors.js";
import { getContextMenuFieldInfos } from "../sampleView/selectionAggregationCandidates.js";
import { listViewWorkflows } from "./viewWorkflowCatalog.js";

/**
 * @param {import("../app.js").default} app
 * @returns {import("./types.js").AgentViewWorkflowContext}
 */
export function getViewWorkflowContext(app) {
    const sampleView = app.getSampleView();
    const selections = buildSelectionSummaries(app);
    const fields = buildFieldSummaries(sampleView, selections);

    return {
        selections,
        fields,
        workflows: listViewWorkflows(),
    };
}

/**
 * @param {import("../app.js").default} app
 * @returns {import("./types.js").AgentSelectionSummary[]}
 */
function buildSelectionSummaries(app) {
    const sampleView = app.getSampleView();
    const paramConfigs = sampleView?.paramRuntime?.paramConfigs;
    const entries =
        app.provenance.getPresentState?.()?.paramProvenance?.entries ?? {};

    return Object.values(entries)
        .filter(
            (entry) =>
                entry?.selector &&
                Array.isArray(entry.selector.scope) &&
                isActiveIntervalSelectionValue(entry.value)
        )
        .map((entry) => ({
            id: createSelectionId(entry.selector),
            type: "interval",
            label: entry.selector.param,
            description: /** @type {string | undefined} */ (
                paramConfigs?.get(entry.selector.param)?.description
            ),
            selector: entry.selector,
            active: true,
            nameSuffix: createSelectionNameSuffix(entry.value),
        }));
}

/**
 * @param {import("../sampleView/sampleView.js").default | undefined} sampleView
 * @param {import("./types.js").AgentSelectionSummary[]} selections
 * @returns {import("./types.js").AgentViewFieldSummary[]}
 */
function buildFieldSummaries(sampleView, selections) {
    if (!sampleView) {
        return [];
    }

    /** @type {Map<string, import("./types.js").AgentViewFieldSummary>} */
    const fields = new Map();
    const layoutRoot =
        typeof sampleView.getLayoutAncestors === "function"
            ? (sampleView.getLayoutAncestors().at(-1) ?? sampleView)
            : sampleView;

    for (const selection of selections) {
        let resolved;
        try {
            resolved = resolveParamSelector(sampleView, selection.selector);
        } catch {
            resolved = undefined;
        }
        const ownerView = resolved?.view;
        if (!ownerView) {
            continue;
        }

        for (const fieldInfo of getContextMenuFieldInfos(
            ownerView,
            layoutRoot,
            true
        )) {
            const id = createFieldId(
                selection.id,
                fieldInfo.viewSelector.view,
                fieldInfo.field
            );
            const existing = fields.get(id);
            if (existing) {
                if (!existing.selectionIds.includes(selection.id)) {
                    existing.selectionIds.push(selection.id);
                }
                continue;
            }

            fields.set(id, {
                id,
                candidateId: fieldInfo.candidateId,
                view: fieldInfo.viewSelector.view,
                viewSelector: fieldInfo.viewSelector,
                viewTitle: fieldInfo.viewTitle,
                field: fieldInfo.field,
                dataType: fieldInfo.type,
                description: fieldInfo.description,
                selectionIds: [selection.id],
                supportedAggregations: fieldInfo.supportedAggregations.slice(),
            });
        }
    }

    return Array.from(fields.values()).sort(
        (a, b) =>
            a.viewTitle.localeCompare(b.viewTitle) ||
            a.field.localeCompare(b.field)
    );
}

/**
 * @param {any} selector
 */
function createSelectionId(selector) {
    return JSON.stringify(selector);
}

/**
 * @param {unknown} value
 */
function createSelectionNameSuffix(value) {
    const interval = extractSelectionInterval(value);
    if (interval) {
        return "brush_" + hashString(JSON.stringify(interval));
    }

    return "brush_" + hashString(JSON.stringify(value));
}

/**
 * @param {string} selectionId
 * @param {string} view
 * @param {string} field
 */
export function createFieldId(selectionId, view, field) {
    return JSON.stringify({ selectionId, view, field });
}

/**
 * @param {unknown} value
 */
function isActiveIntervalSelectionValue(value) {
    if (
        value &&
        typeof value === "object" &&
        "intervals" in value &&
        value.intervals &&
        typeof value.intervals === "object"
    ) {
        const intervals = /** @type {any} */ (value.intervals);
        if (Array.isArray(intervals.x) && intervals.x.length === 2) {
            return true;
        }
    }

    return (
        !!value &&
        typeof value === "object" &&
        "value" in value &&
        Array.isArray(/** @type {any} */ (value).value) &&
        /** @type {any} */ (value).value.length === 2
    );
}

/**
 * @param {unknown} value
 * @returns {unknown[] | undefined}
 */
function extractSelectionInterval(value) {
    if (
        value &&
        typeof value === "object" &&
        "intervals" in value &&
        value.intervals &&
        typeof value.intervals === "object"
    ) {
        const intervals = /** @type {any} */ (value.intervals);
        if (Array.isArray(intervals.x)) {
            return intervals.x;
        }
    }

    if (
        value &&
        typeof value === "object" &&
        "value" in value &&
        Array.isArray(/** @type {any} */ (value).value)
    ) {
        return /** @type {any} */ (value).value;
    }

    return undefined;
}

/**
 * @param {string} value
 */
function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(36).slice(0, 6);
}
