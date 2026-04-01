import {
    asSelectionConfig,
    isIntervalSelectionConfig,
    isPointSelectionConfig,
} from "@genome-spy/core/selection/selection.js";
import {
    getParamSelector,
    resolveParamSelector,
} from "@genome-spy/core/view/viewSelectors.js";
import { getContextMenuFieldInfos } from "../sampleView/contextMenuBuilder.js";
import { formatScopedParamName } from "../viewScopeUtils.js";
import { listViewWorkflows } from "./viewWorkflowCatalog.js";

const QUANTITATIVE_AGGREGATIONS = [
    "min",
    "max",
    "count",
    "weightedMean",
    "variance",
];

const DEFAULT_AGGREGATIONS = ["count"];

/**
 * @param {import("../app.js").default} app
 * @returns {import("./types.js").AgentViewWorkflowContext}
 */
export function getViewWorkflowContext(app) {
    const selectionDeclarations = buildSelectionDeclarations(app);
    const selections = buildSelectionSummaries(app);
    const fields = buildFieldSummaries(app, selections);

    return {
        selectionDeclarations,
        selections,
        fields,
        workflows: listViewWorkflows(),
    };
}

/**
 * @param {import("../app.js").default} app
 * @returns {import("./types.js").AgentSelectionDeclaration[]}
 */
function buildSelectionDeclarations(app) {
    const sampleView = app.getSampleView();
    if (!sampleView || typeof sampleView.visit !== "function") {
        return [];
    }

    /** @type {import("./types.js").AgentSelectionDeclaration[]} */
    const declarations = [];

    sampleView.visit((view) => {
        if (!view?.paramRuntime?.paramConfigs) {
            return;
        }

        for (const [paramName, param] of view.paramRuntime.paramConfigs) {
            if (!("select" in param)) {
                continue;
            }

            const select = asSelectionConfig(param.select);
            const viewName = getAddressableViewName(view);
            if (!viewName) {
                continue;
            }

            let selector;
            try {
                selector = getParamSelector(view, paramName);
            } catch {
                continue;
            }

            const currentValue = view.paramRuntime.getValue(paramName);

            declarations.push({
                id: createSelectionId(selector),
                selectionType: select.type,
                label: formatScopedParamName(sampleView, selector),
                paramName,
                selector,
                view: viewName,
                viewTitle: String(view.getTitleText?.() ?? view.name ?? "view"),
                persist: param.persist !== false,
                active: isActiveSelectionValue(select.type, currentValue),
                encodings: isIntervalSelectionConfig(select)
                    ? [...(select.encodings ?? [])]
                    : undefined,
                toggle:
                    isPointSelectionConfig(select) && select.toggle
                        ? true
                        : undefined,
                clearable: select.clear !== false,
            });
        }
    });

    return declarations.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * @param {import("../app.js").default} app
 * @returns {import("./types.js").AgentSelectionSummary[]}
 */
function buildSelectionSummaries(app) {
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
            selector: entry.selector,
            active: true,
            nameSuffix: createSelectionNameSuffix(entry.value),
        }));
}

/**
 * @param {"point" | "interval"} selectionType
 * @param {unknown} value
 * @returns {boolean}
 */
function isActiveSelectionValue(selectionType, value) {
    if (selectionType === "interval") {
        return isActiveIntervalSelectionValue(value);
    }

    if (selectionType === "point") {
        return isActivePointSelectionValue(value);
    }

    return false;
}

/**
 * @param {import("../app.js").default} app
 * @param {import("./types.js").AgentSelectionSummary[]} selections
 * @returns {import("./types.js").AgentViewFieldSummary[]}
 */
function buildFieldSummaries(app, selections) {
    const sampleView = app.getSampleView();
    if (!sampleView) {
        return [];
    }

    /** @type {Map<string, import("./types.js").AgentViewFieldSummary>} */
    const fields = new Map();

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

        for (const fieldInfo of getSelectionFieldInfos(sampleView, ownerView)) {
            const id = createFieldId(
                selection.id,
                fieldInfo.view,
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
                view: fieldInfo.view,
                viewTitle: fieldInfo.viewTitle,
                field: fieldInfo.field,
                dataType: fieldInfo.dataType,
                selectionIds: [selection.id],
                supportedAggregations: getSupportedAggregations(
                    fieldInfo.dataType
                ),
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
 * @param {import("../sampleView/sampleView.js").default} sampleView
 * @param {any} ownerView
 */
function getSelectionFieldInfos(sampleView, ownerView) {
    const layoutRoot =
        typeof sampleView.getLayoutAncestors === "function"
            ? (sampleView.getLayoutAncestors().at(-1) ?? sampleView)
            : sampleView;

    try {
        const fieldInfos = getContextMenuFieldInfos(
            ownerView,
            layoutRoot,
            true
        );
        if (fieldInfos.length > 0) {
            return deduplicateFieldInfos(
                fieldInfos
                    .map((info) => {
                        const viewName = getAddressableViewName(info.view);
                        if (!viewName) {
                            return undefined;
                        }

                        return {
                            view: viewName,
                            viewTitle: String(
                                info.view.getTitleText?.() ?? viewName
                            ),
                            field: info.field,
                            dataType: info.type,
                        };
                    })
                    .filter(Boolean)
            );
        }
    } catch {
        // Fall back to lightweight encoding inspection in tests or partial stubs.
    }

    return deduplicateFieldInfos(getEncodingFieldInfos(ownerView));
}

/**
 * @param {any} view
 */
function getEncodingFieldInfos(view) {
    const viewName = getAddressableViewName(view);
    const encoding =
        typeof view?.getEncoding === "function"
            ? view.getEncoding()
            : undefined;
    if (!viewName || !encoding || typeof encoding !== "object") {
        return [];
    }

    /** @type {Array<{ view: string, viewTitle: string, field: string, dataType: string }>} */
    const fields = [];
    for (const [channel, def] of Object.entries(encoding)) {
        if (
            ["sample", "x", "x2"].includes(channel) ||
            !def ||
            typeof def !== "object" ||
            !("field" in def) ||
            typeof def.field !== "string"
        ) {
            continue;
        }

        fields.push({
            view: viewName,
            viewTitle: String(view.getTitleText?.() ?? viewName),
            field: def.field,
            dataType:
                "type" in def && typeof def.type === "string"
                    ? def.type
                    : "nominal",
        });
    }

    return fields;
}

/**
 * @param {Array<{ view: string, viewTitle: string, field: string, dataType: string }>} fields
 */
function deduplicateFieldInfos(fields) {
    return Array.from(
        new Map(
            fields.map((fieldInfo) => [
                JSON.stringify([fieldInfo.view, fieldInfo.field]),
                fieldInfo,
            ])
        ).values()
    );
}

/**
 * @param {string} dataType
 */
function getSupportedAggregations(dataType) {
    return dataType === "quantitative"
        ? QUANTITATIVE_AGGREGATIONS
        : DEFAULT_AGGREGATIONS;
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
 * @param {any} view
 */
function getAddressableViewName(view) {
    const candidate = view?.explicitName ?? view?.name;
    return typeof candidate === "string" && candidate.length > 0
        ? candidate
        : undefined;
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
 * @returns {boolean}
 */
function isActivePointSelectionValue(value) {
    return Boolean(
        value &&
        typeof value === "object" &&
        "type" in value &&
        value.type === "point" &&
        "keys" in value &&
        Array.isArray(/** @type {any} */ (value).keys) &&
        /** @type {any} */ (value).keys.length > 0
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
