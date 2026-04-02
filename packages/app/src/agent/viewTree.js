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
    getViewSelector,
    visitAddressableViews,
} from "@genome-spy/core/view/viewSelectors.js";
import { asSelectionConfig } from "@genome-spy/core/selection/selection.js";
import { getParamSelector } from "@genome-spy/core/view/viewSelectors.js";
import { formatScopedParamName } from "../viewScopeUtils.js";

/**
 * Builds a normalized, spec-like view tree for the agent.
 *
 * @param {import("../app.js").default} app
 * @returns {import("./types.d.ts").AgentViewTreeRoot}
 */
export function buildViewTree(app) {
    const sampleView = app.getSampleView();
    const rootConfig = summarizeRootConfig(app?.genomeSpy?.spec);

    if (!sampleView) {
        return {
            rootConfig,
            root: createUnknownRootNode(),
        };
    }

    /** @type {Map<any, import("./types.d.ts").AgentViewNode>} */
    const nodes = new Map();
    /** @type {import("./types.d.ts").AgentViewNode | undefined} */
    let rootNode;

    visitAddressableViews(sampleView, (view) => {
        if (isChromeView(view)) {
            return VISIT_SKIP;
        }

        const node = summarizeViewNode(sampleView, view);
        nodes.set(view, node);

        const parentNode = findParentNode(view, nodes);
        if (parentNode) {
            parentNode.children.push(node);
        } else {
            rootNode = node;
        }
    });

    if (!rootNode) {
        rootNode = summarizeViewNode(sampleView, sampleView);
    }

    pruneEmptyContainers(rootNode);

    return {
        rootConfig,
        root: rootNode,
    };
}

/**
 * Removes empty structural containers from the tree in-place.
 *
 * @param {import("./types.d.ts").AgentViewNode} node
 */
function pruneEmptyContainers(node) {
    node.children = node.children.filter((child) => {
        pruneEmptyContainers(child);

        if (child.kind !== "container") {
            return true;
        }

        if (child.children.length > 0) {
            return true;
        }

        if (child.selectionDeclarations.length > 0) {
            return true;
        }

        if (child.encodings.length > 0) {
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

    if (typeof rootSpec.background === "string") {
        summary.background = rootSpec.background;
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

    if (rootSpec.theme) {
        summary.theme = rootSpec.theme;
    }

    return Object.keys(summary).length > 0 ? summary : undefined;
}

function createUnknownRootNode() {
    /** @type {import("./types.d.ts").AgentViewNode} */
    const node = {
        id: "unknown",
        kind: "root",
        type: "unknown",
        name: "unknown",
        title: "Unknown view",
        visible: true,
        encodings:
            /** @type {import("./types.d.ts").AgentViewEncodingSummary[]} */ ([]),
        selectionDeclarations:
            /** @type {import("./types.d.ts").AgentSelectionDeclaration[]} */ ([]),
        children: /** @type {import("./types.d.ts").AgentViewNode[]} */ ([]),
    };

    return node;
}

/**
 * @param {any} root
 * @param {any} view
 * @returns {import("./types.d.ts").AgentViewNode}
 */
function summarizeViewNode(root, view) {
    const spec = view.spec ?? {};
    const effectiveEncoding =
        typeof view.getEncoding === "function"
            ? view.getEncoding()
            : (spec.encoding ?? {});
    const ownEncoding = spec.encoding ?? {};
    const isRoot = view === root;

    /** @type {import("./types.d.ts").AgentViewNode} */
    const node = {
        id: getViewId(view),
        kind: /** @type {import("./types.d.ts").AgentViewNode["kind"]} */ (
            isRoot ? "root" : getViewKind(view)
        ),
        type: /** @type {import("./types.d.ts").AgentViewNode["type"]} */ (
            isRoot ? "sampleView" : getViewType(view)
        ),
        name: getViewName(view),
        title: String(view.getTitleText?.() ?? getViewName(view)),
        description:
            typeof spec.description === "string" ? spec.description : undefined,
        selector: getViewSelectorOrUndefined(view),
        markType: getMarkType(view),
        visible:
            typeof view.isVisible === "function"
                ? view.isVisible()
                : typeof view.isVisibleInSpec === "function"
                  ? view.isVisibleInSpec()
                  : true,
        data: summarizeDataSpec(spec.data),
        encodings:
            /** @type {import("./types.d.ts").AgentViewEncodingSummary[]} */ (
                summarizeEncodings(effectiveEncoding, ownEncoding)
            ),
        selectionDeclarations:
            /** @type {import("./types.d.ts").AgentSelectionDeclaration[]} */ (
                summarizeSelectionDeclarations(root, view)
            ),
        children: /** @type {import("./types.d.ts").AgentViewNode[]} */ ([]),
    };

    return node;
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
function getViewId(view) {
    if (typeof view.getPathString === "function") {
        return view.getPathString();
    }

    return getViewName(view);
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
 * @returns {import("./types.d.ts").AgentViewNode["kind"]}
 */
function getViewKind(view) {
    const type = getViewType(view);

    if (type === "unit") {
        return "leaf";
    }

    if (
        type === "layer" ||
        type === "concat" ||
        type === "vconcat" ||
        type === "hconcat" ||
        type === "facet" ||
        type === "multiscale" ||
        type === "sampleView"
    ) {
        return "container";
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
        };
    }

    if ("values" in data) {
        return {
            kind: "inline",
            source: "inline",
            format: getDataFormatKind(data.format),
        };
    }

    if ("name" in data && typeof data.name === "string") {
        return {
            kind: "named",
            source: data.name,
            format: getDataFormatKind(data.format),
        };
    }

    if ("sequence" in data) {
        return {
            kind: "generator",
            source: "sequence",
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
        };
    }

    if ("dynamicCallbackSource" in data) {
        return {
            kind: "callback",
            source: "dynamicCallback",
        };
    }

    return {
        kind: "other",
        source: "other",
        format: getDataFormatKind(data.format),
    };
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
 * @param {any} effectiveEncoding
 * @param {any} ownEncoding
 * @returns {import("./types.d.ts").AgentViewEncodingSummary[]}
 */
function summarizeEncodings(effectiveEncoding, ownEncoding) {
    if (!effectiveEncoding || typeof effectiveEncoding !== "object") {
        return [];
    }

    return Object.entries(effectiveEncoding)
        .filter(([channel]) => !isInternalChannel(channel))
        .map(([channel, def]) => summarizeEncoding(channel, def, ownEncoding))
        .filter(Boolean);
}

/**
 * @param {string} channel
 * @param {any} def
 * @param {any} ownEncoding
 * @returns {import("./types.d.ts").AgentViewEncodingSummary | undefined}
 */
function summarizeEncoding(channel, def, ownEncoding) {
    if (!def || typeof def !== "object") {
        return {
            channel,
            inherited: !Object.hasOwn(ownEncoding ?? {}, channel),
        };
    }

    /** @type {import("./types.d.ts").AgentViewEncodingSummary} */
    const summary = {
        channel,
        inherited: !Object.hasOwn(ownEncoding ?? {}, channel),
    };

    if ("field" in def && typeof def.field === "string") {
        summary.field = def.field;
    }

    if ("type" in def && typeof def.type === "string") {
        summary.type = def.type;
    }

    if ("title" in def && typeof def.title === "string") {
        summary.title = def.title;
    }

    if ("aggregate" in def && typeof def.aggregate === "string") {
        summary.type ??= def.aggregate;
    }

    return summary;
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
 * @returns {import("./types.d.ts").AgentSelectionDeclaration[]}
 */
function summarizeSelectionDeclarations(root, view) {
    if (!view?.paramRuntime?.paramConfigs) {
        return [];
    }

    /** @type {import("./types.d.ts").AgentSelectionDeclaration[]} */
    const declarations = [];

    for (const [paramName, param] of view.paramRuntime.paramConfigs) {
        if (!("select" in param)) {
            continue;
        }

        const select = asSelectionConfig(param.select);
        let selector;
        try {
            selector = getParamSelector(view, paramName);
        } catch {
            continue;
        }

        declarations.push({
            id: JSON.stringify(selector),
            selectionType: select.type,
            label: formatScopedParamName(root, selector),
            paramName,
            selector,
            view: getViewName(view),
            viewTitle: String(view.getTitleText?.() ?? view.name ?? "view"),
            persist: param.persist !== false,
            active: isActiveSelectionValue(
                select.type,
                view.paramRuntime.getValue(paramName)
            ),
            encodings:
                select.type === "interval"
                    ? [...(select.encodings ?? [])]
                    : undefined,
            toggle: select.type === "point" && select.toggle ? true : undefined,
            clearable: select.clear !== false,
        });
    }

    return declarations.sort((a, b) => a.label.localeCompare(b.label));
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
 * @param {unknown} value
 * @returns {boolean}
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
