import {
    isConcatSpec,
    isFacetSpec,
    isHConcatSpec,
    isLayerSpec,
    isUnitSpec,
    isVConcatSpec,
} from "@genome-spy/core/view/viewSpecGuards.js";
import { VISIT_SKIP } from "@genome-spy/core/view/view.js";
import { isMultiscaleSpec } from "@genome-spy/core/view/multiscale.js";
import {
    isChromeView,
    getParamSelector,
    getViewSelector,
    makeParamSelectorKey,
    visitNonChromeViews,
    visitAddressableViews,
} from "@genome-spy/core/view/viewSelectors.js";
import { asSelectionConfig } from "@genome-spy/core/selection/selection.js";
import { isVariableParameter } from "@genome-spy/core/paramRuntime/paramUtils.js";
import {
    formatScopedParamName,
    getContextMenuFieldInfos,
    makeViewSelectorKey,
} from "@genome-spy/app/agentShared";

/**
 * Builds a normalized, spec-like view tree for the agent.
 *
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
 * @param {import("./types.d.ts").AgentContextOptions} [options]
 * @returns {import("./types.d.ts").AgentViewTreeRoot}
 */
export function buildViewTree(agentApi, options = {}) {
    const rootView = agentApi.getViewRoot();
    const hasStructuralRoot = Boolean(rootView);
    const rootSpec = agentApi.getRootSpec() ?? rootView?.spec;
    const rootConfig = summarizeRootConfig(rootSpec);
    const expandedViewNodeKeys = new Set(options.expandedViewNodeKeys ?? []);
    const focusView = agentApi.getFocusedView() ?? rootView;
    const focusBranch = new Set(
        typeof focusView?.getLayoutAncestors === "function"
            ? focusView.getLayoutAncestors()
            : focusView
              ? [focusView]
              : []
    );

    if (!rootView) {
        const root = createUnknownRootNode();
        compactViewNode(root);
        return {
            rootConfig,
            root,
        };
    }

    const aggregatableSelectionsByView =
        buildAggregatableSelectionsByView(rootView);

    /** @type {Map<any, import("./types.d.ts").AgentViewNode>} */
    const nodes = new Map();
    /** @type {import("./types.d.ts").AgentViewNode | undefined} */
    let rootNode;

    const visitViews = hasStructuralRoot
        ? visitNonChromeViews
        : visitAddressableViews;

    visitViews(rootView, (view) => {
        if (isChromeView(view)) {
            return VISIT_SKIP;
        }

        const node = summarizeViewNode(
            rootView,
            view,
            hasStructuralRoot,
            aggregatableSelectionsByView
        );
        const canCollapse = node.selector !== undefined;
        if (
            canCollapse &&
            ((shouldCollapseView(view, focusView, focusBranch) &&
                !isExpandedView(view, expandedViewNodeKeys)) ||
                node.visible === false)
        ) {
            node.collapsed = true;
            const childCount = getChildCount(view);
            if (childCount > 0) {
                node.childCount = childCount;
            }
            node.encodings = {};
        }
        nodes.set(view, node);

        const parentNode = findParentNode(view, nodes);
        if (parentNode) {
            parentNode.children.push(node);
        } else {
            rootNode = node;
        }

        if (node.collapsed) {
            return VISIT_SKIP;
        }
    });

    if (!rootNode) {
        rootNode = summarizeViewNode(
            rootView,
            rootView,
            hasStructuralRoot,
            aggregatableSelectionsByView
        );
    }

    pruneEmptyContainers(rootNode);
    compactViewNode(rootNode);

    return {
        rootConfig,
        root: rootNode,
    };
}

/**
 * @param {any} view
 * @param {any} focusView
 * @param {Set<any>} focusBranch
 * @returns {boolean}
 */
function shouldCollapseView(view, focusView, focusBranch) {
    if (focusBranch.has(view)) {
        return false;
    }

    const ancestors =
        typeof view.getLayoutAncestors === "function"
            ? view.getLayoutAncestors()
            : [view];

    return !ancestors.includes(focusView);
}

/**
 * @param {any} view
 * @param {Set<string>} expandedViewNodeKeys
 * @returns {boolean}
 */
function isExpandedView(view, expandedViewNodeKeys) {
    if (expandedViewNodeKeys.size === 0) {
        return false;
    }

    const selector = getViewSelectorOrUndefined(view);
    if (!selector) {
        return false;
    }

    return expandedViewNodeKeys.has(makeViewSelectorKey(selector));
}

/**
 * Removes empty structural containers from the tree in-place.
 *
 * @param {import("./types.d.ts").AgentViewNode} node
 */
function pruneEmptyContainers(node) {
    if (!Array.isArray(node.children)) {
        return;
    }

    node.children = node.children.filter((child) => {
        pruneEmptyContainers(child);

        if (child.type === "unit") {
            return true;
        }

        if (child.children.length > 0) {
            return true;
        }

        if (child.visible === false) {
            return true;
        }

        if (child.collapsed) {
            return true;
        }

        if (child.parameterDeclarations.length > 0) {
            return true;
        }

        if (Object.keys(child.encodings).length > 0) {
            return true;
        }

        if (child.data) {
            return true;
        }

        if (child.description) {
            return true;
        }

        if (child.markType) {
            return true;
        }

        return false;
    });
}

/**
 * Removes empty arrays from the tree in-place.
 *
 * @param {import("./types.d.ts").AgentViewNode} node
 */
function compactViewNode(node) {
    if (node.collapsed) {
        delete node.data;
    }

    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            compactViewNode(child);
        }

        if (node.children.length === 0) {
            delete node.children;
        }
    }

    if (node.encodings && Object.keys(node.encodings).length === 0) {
        delete node.encodings;
    }

    if (node.parameterDeclarations && node.parameterDeclarations.length === 0) {
        delete node.parameterDeclarations;
    }

    if (
        node.aggregatableBySelections &&
        node.aggregatableBySelections.length === 0
    ) {
        delete node.aggregatableBySelections;
    }
}

/**
 * @param {any} rootSpec
 * @returns {import("./types.d.ts").AgentRootConfigSummary | undefined}
 */
function summarizeRootConfig(rootSpec) {
    if (!rootSpec || typeof rootSpec !== "object") {
        return undefined;
    }

    /** @type {import("./types.d.ts").AgentRootConfigSummary} */
    const summary = {};

    if (typeof rootSpec.assembly === "string") {
        summary.assembly = rootSpec.assembly;
    }

    if (typeof rootSpec.baseUrl === "string") {
        summary.baseUrl = rootSpec.baseUrl;
    }

    if (rootSpec.genomes && typeof rootSpec.genomes === "object") {
        summary.genomes = /** @type {string[]} */ (
            Object.keys(/** @type {Record<string, any>} */ (rootSpec.genomes))
        );
    }

    if (rootSpec.datasets && typeof rootSpec.datasets === "object") {
        summary.datasets = /** @type {string[]} */ (
            Object.keys(/** @type {Record<string, any>} */ (rootSpec.datasets))
        );
    }

    return Object.keys(summary).length > 0 ? summary : undefined;
}

function createUnknownRootNode() {
    /** @type {import("./types.d.ts").AgentViewNode} */
    const node = {
        type: "unknown",
        name: "unknown",
        title: "Unknown view",
        description: "",
        visible: false,
        encodings:
            /** @type {import("./types.d.ts").AgentViewEncodings} */ ({}),
        parameterDeclarations:
            /** @type {import("./types.d.ts").AgentParameterDeclaration[]} */ ([]),
        children: /** @type {import("./types.d.ts").AgentViewNode[]} */ ([]),
    };

    return node;
}

/**
 * @param {any} root
 * @param {any} view
 * @param {boolean} hasStructuralRoot
 * @param {WeakMap<any, import("@genome-spy/core/view/viewSelectors.js").ParamSelector[]>} aggregatableSelectionsByView
 * @returns {import("./types.d.ts").AgentViewNode}
 */
function summarizeViewNode(
    root,
    view,
    hasStructuralRoot,
    aggregatableSelectionsByView
) {
    const spec = view.spec ?? {};
    const effectiveEncoding =
        typeof view.getEncoding === "function"
            ? view.getEncoding()
            : (spec.encoding ?? {});
    const ownEncoding = spec.encoding ?? {};
    const type = getViewType(view);
    const isRoot = view === root;
    const rawTitle = view.getTitleText?.();
    const title = String(rawTitle ?? getViewName(view));
    const name = getViewName(view);
    const visible =
        typeof view.isVisible === "function"
            ? view.isVisible()
            : typeof view.isVisibleInSpec === "function"
              ? view.isVisibleInSpec()
              : true;

    /** @type {import("./types.d.ts").AgentViewNode} */
    const node = {
        type: /** @type {import("./types.d.ts").AgentViewNode["type"]} */ (
            getViewType(view)
        ),
        title,
        name: rawTitle === undefined ? name : name !== title ? name : undefined,
        description: normalizeDescription(spec.description) ?? "",
        selector:
            isRoot && hasStructuralRoot
                ? undefined
                : getViewSelectorOrUndefined(view),
        markType: getMarkType(view),
        visible,
        data: summarizeDataSpec(spec.data),
        encodings: /** @type {import("./types.d.ts").AgentViewEncodings} */ (
            type === "unit"
                ? summarizeEncodings(view, effectiveEncoding, ownEncoding)
                : {}
        ),
        parameterDeclarations:
            /** @type {import("./types.d.ts").AgentParameterDeclaration[]} */ (
                summarizeParameterDeclarations(root, view)
            ),
        aggregatableBySelections: aggregatableSelectionsByView.get(view),
        children: /** @type {import("./types.d.ts").AgentViewNode[]} */ ([]),
    };

    return node;
}

/**
 * @param {any} rootView
 * @returns {WeakMap<any, import("@genome-spy/core/view/viewSelectors.js").ParamSelector[]>}
 */
function buildAggregatableSelectionsByView(rootView) {
    /** @type {WeakMap<any, import("@genome-spy/core/view/viewSelectors.js").ParamSelector[]>} */
    const selectionsByView = new WeakMap();
    const layoutRoot =
        typeof rootView.getLayoutAncestors === "function"
            ? (rootView.getLayoutAncestors().at(-1) ?? rootView)
            : rootView;

    visitNonChromeViews(rootView, (view) => {
        if (!view?.paramRuntime?.paramConfigs) {
            return;
        }

        for (const [paramName, param] of view.paramRuntime.paramConfigs) {
            if (!("select" in param)) {
                continue;
            }

            const select = asSelectionConfig(param.select);
            if (select.type !== "interval") {
                continue;
            }

            let selector;
            try {
                selector = getParamSelector(view, paramName);
            } catch {
                continue;
            }
            const selectorKey = makeParamSelectorKey(selector);

            for (const fieldInfo of getContextMenuFieldInfos(
                view,
                layoutRoot,
                true
            )) {
                const selectors = selectionsByView.get(fieldInfo.view) ?? [];
                if (
                    selectors.every(
                        (candidate) =>
                            makeParamSelectorKey(candidate) !== selectorKey
                    )
                ) {
                    selectors.push(selector);
                    selectionsByView.set(fieldInfo.view, selectors);
                }
            }
        }
    });

    return selectionsByView;
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
 * @param {any} view
 * @returns {number}
 */
function getChildCount(view) {
    return Array.isArray(view?.children) ? view.children.length : 0;
}

/**
 * @param {any} view
 * @param {Map<any, import("./types.d.ts").AgentViewNode>} nodes
 */
function findParentNode(view, nodes) {
    const ancestors =
        typeof view.getLayoutAncestors === "function"
            ? view.getLayoutAncestors()
            : [view];

    for (let i = 1; i < ancestors.length; i += 1) {
        const ancestorNode = nodes.get(ancestors[i]);
        if (ancestorNode) {
            return ancestorNode;
        }
    }

    return undefined;
}

/**
 * @param {any} view
 * @returns {string}
 */
function getViewName(view) {
    const candidate = view?.explicitName ?? view?.name;
    return typeof candidate === "string" && candidate.length > 0
        ? candidate
        : "view";
}

/**
 * @param {any} view
 * @returns {import("./types.d.ts").AgentViewNode["type"]}
 */
function getViewType(view) {
    const spec = view.spec ?? {};

    if (view?.mark) {
        return "unit";
    }

    if (isLayerSpec(spec)) {
        return "layer";
    }

    if (isUnitSpec(spec)) {
        return "unit";
    }

    if (isFacetSpec(spec)) {
        return "facet";
    }

    if (isVConcatSpec(spec)) {
        return "vconcat";
    }

    if (isHConcatSpec(spec)) {
        return "hconcat";
    }

    if (isConcatSpec(spec)) {
        return "concat";
    }

    if (isMultiscaleSpec(spec)) {
        return "multiscale";
    }

    if (view?.constructor?.name === "SampleView") {
        return "sampleView";
    }

    return "other";
}

/**
 * @param {any} view
 * @returns {string | undefined}
 */
function getMarkType(view) {
    if (typeof view.getMarkType !== "function") {
        return undefined;
    }

    try {
        return view.getMarkType();
    } catch {
        return undefined;
    }
}

/**
 * @param {any} data
 * @returns {import("./types.d.ts").AgentViewDataSummary | undefined}
 */
function summarizeDataSpec(data) {
    if (!data || typeof data !== "object") {
        return undefined;
    }

    if ("url" in data) {
        const source =
            typeof data.url === "string"
                ? data.url
                : Array.isArray(data.url)
                  ? "url[]"
                  : "url";
        return {
            kind: "url",
            source,
            format: getDataFormatKind(data.format),
            description: normalizeDescription(data.description),
        };
    }

    if ("values" in data) {
        return {
            kind: "inline",
            source: "inline",
            format: getDataFormatKind(data.format),
            description: normalizeDescription(data.description),
        };
    }

    if ("name" in data && typeof data.name === "string") {
        return {
            kind: "named",
            source: data.name,
            format: getDataFormatKind(data.format),
            description: normalizeDescription(data.description),
        };
    }

    if ("sequence" in data) {
        return {
            kind: "generator",
            source: "sequence",
            description: normalizeDescription(data.description),
        };
    }

    if ("lazy" in data) {
        const lazy = data.lazy;
        const lazyKind =
            lazy && typeof lazy === "object" && "type" in lazy
                ? String(lazy.type)
                : "lazy";
        return {
            kind: "lazy",
            source: lazyKind,
            description: normalizeDescription(data.description),
        };
    }

    if ("dynamicCallbackSource" in data) {
        return {
            kind: "callback",
            source: "dynamicCallback",
            description: normalizeDescription(data.description),
        };
    }

    return {
        kind: "other",
        source: "other",
        format: getDataFormatKind(data.format),
        description: normalizeDescription(data.description),
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
 * @param {any} format
 * @returns {string | undefined}
 */
function getDataFormatKind(format) {
    if (!format) {
        return undefined;
    }

    if (typeof format === "string") {
        return format;
    }

    if (typeof format === "object" && typeof format.type === "string") {
        return format.type;
    }

    return undefined;
}

/**
 * @param {any} view
 * @param {any} effectiveEncoding
 * @param {any} ownEncoding
 * @returns {import("./types.d.ts").AgentViewEncodings}
 */
function summarizeEncodings(view, effectiveEncoding, ownEncoding) {
    if (!effectiveEncoding || typeof effectiveEncoding !== "object") {
        return {};
    }

    return Object.fromEntries(
        Object.entries(effectiveEncoding)
            .filter(([channel]) => !isInternalChannel(channel))
            .map(([channel, def]) => {
                const summary = summarizeEncoding(
                    view,
                    channel,
                    def,
                    ownEncoding
                );
                return summary ? [channel, summary] : undefined;
            })
            .filter(Boolean)
    );
}

/**
 * @param {any} view
 * @param {string} channel
 * @param {any} def
 * @param {any} ownEncoding
 * @returns {import("./types.d.ts").AgentViewEncodingSummary | undefined}
 */
function summarizeEncoding(view, channel, def, ownEncoding) {
    if (!isDataDrivenEncoding(def)) {
        return undefined;
    }

    /** @type {import("./types.d.ts").AgentViewEncodingSummary} */
    const summary = {
        inherited: !Object.hasOwn(ownEncoding ?? {}, channel),
    };

    if ("field" in def && typeof def.field === "string") {
        summary.sourceKind = "field";
        summary.field = def.field;
    }

    if ("expr" in def && typeof def.expr === "string") {
        summary.sourceKind = "expr";
        summary.expr = def.expr;
    }

    if ("datum" in def) {
        summary.sourceKind = "datum";
        summary.datum = def.datum;
    }

    if ("type" in def && typeof def.type === "string") {
        summary.type = def.type;
    }

    if ("title" in def && typeof def.title === "string") {
        summary.title = def.title;
    }

    if ("description" in def) {
        summary.description = normalizeDescription(def.description);
    }

    const scaleResolution =
        typeof view.getScaleResolution === "function"
            ? view.getScaleResolution(channel)
            : undefined;
    const scale = summarizeScale(channel, scaleResolution);
    if (scale) {
        summary.scale = scale;
    }

    if ("aggregate" in def && typeof def.aggregate === "string") {
        summary.type ??= def.aggregate;
    }

    return summary;
}

/**
 * @param {string} channel
 * @param {any} scaleResolution
 * @returns {import("./types.d.ts").AgentViewScaleSummary | undefined}
 */
function summarizeScale(channel, scaleResolution) {
    if (!scaleResolution) {
        return undefined;
    }

    const scale = scaleResolution.getScale();
    const props = scale.props ?? {};
    /** @type {import("./types.d.ts").AgentViewScaleSummary} */
    const summary = {
        type: String(
            props.type ?? scaleResolution.getResolvedScaleType() ?? "null"
        ),
    };

    if (summary.type === "null") {
        return summary;
    }

    if (props.scheme !== undefined) {
        summary.scheme = props.scheme;
    }

    if (props.assembly !== undefined) {
        summary.assembly = props.assembly;
    }

    if (props.reverse === true) {
        summary.reverse = true;
    }

    if (
        channel !== "x" &&
        channel !== "y" &&
        channel !== "x2" &&
        channel !== "y2"
    ) {
        const range = scale.range();
        if (range !== undefined && typeof range !== "function") {
            summary.range = range;
        }
    }

    if (summary.type !== "locus") {
        const domain = scale.domain();
        if (domain !== undefined) {
            summary.domain = domain;
        }
    }

    return summary;
}

/**
 * @param {any} def
 * @returns {boolean}
 */
function isDataDrivenEncoding(def) {
    return Boolean(
        def &&
        typeof def === "object" &&
        ("field" in def || "expr" in def || "datum" in def)
    );
}

/**
 * @param {string} channel
 * @returns {boolean}
 */
function isInternalChannel(channel) {
    return [
        "sample",
        "uniqueId",
        "search",
        "facetIndex",
        "semanticScore",
    ].includes(channel);
}

/**
 * @param {any} root
 * @param {any} view
 * @returns {import("./types.d.ts").AgentParameterDeclaration[]}
 */
function summarizeParameterDeclarations(root, view) {
    if (!view?.paramRuntime?.paramConfigs) {
        return [];
    }

    /** @type {import("./types.d.ts").AgentParameterDeclaration[]} */
    const declarations = [];

    for (const [paramName, param] of view.paramRuntime.paramConfigs) {
        let selector;
        try {
            selector = getParamSelector(view, paramName);
        } catch {
            continue;
        }

        if ("select" in param) {
            const select = asSelectionConfig(param.select);
            declarations.push({
                parameterType: "selection",
                selectionType: select.type,
                label: formatScopedParamName(root, selector),
                description: normalizeDescription(param.description) ?? "",
                selector,
                persist: param.persist !== false,
                encodings:
                    select.type === "interval"
                        ? [...(select.encodings ?? [])]
                        : undefined,
                clearable: select.clear !== false,
            });
            continue;
        }

        if (!isVariableParameter(param) || !param.bind) {
            continue;
        }

        const bind = param.bind;
        if (!("input" in bind)) {
            continue;
        }

        declarations.push({
            parameterType: "variable",
            label: bind.name ?? formatScopedParamName(root, selector),
            description:
                normalizeDescription(param.description) ??
                normalizeDescription(bind.description) ??
                "",
            selector,
            persist: param.persist !== false,
            bind: summarizeInputBinding(bind),
        });
    }

    return declarations.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * @param {any} bind
 * @returns {import("./types.d.ts").AgentParameterBindSummary}
 */
function summarizeInputBinding(bind) {
    /** @type {import("./types.d.ts").AgentParameterBindSummary} */
    const summary = {
        input: bind.input,
        label: typeof bind.name === "string" ? bind.name : "",
    };

    if (typeof bind.description === "string") {
        summary.description = bind.description;
    }

    if (typeof bind.debounce === "number") {
        summary.debounce = bind.debounce;
    }

    if (bind.input === "range") {
        if (typeof bind.min === "number") {
            summary.min = bind.min;
        }

        if (typeof bind.max === "number") {
            summary.max = bind.max;
        }

        if (typeof bind.step === "number") {
            summary.step = bind.step;
        }
    } else if (bind.input === "radio" || bind.input === "select") {
        if (!Array.isArray(bind.options)) {
            throw new Error(
                "Input bind " + bind.input + " must declare options."
            );
        }

        summary.options = [...bind.options];
        if (Array.isArray(bind.labels)) {
            summary.labels = [...bind.labels];
        }
    } else if (
        bind.input === "text" ||
        bind.input === "number" ||
        bind.input === "color"
    ) {
        if (typeof bind.placeholder === "string") {
            summary.placeholder = bind.placeholder;
        }

        if (typeof bind.autocomplete === "string") {
            summary.autocomplete = bind.autocomplete;
        }
    } else if (bind.input === "checkbox") {
        // No additional metadata.
    } else {
        throw new Error("Unsupported input bind type: " + bind.input);
    }

    return summary;
}
