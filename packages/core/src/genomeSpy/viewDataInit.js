import {
    broadcastSubtreeDataReady,
    findAncestorDataSource,
    initializeViewSubtree,
    loadViewSubtreeData,
} from "../data/flowInit.js";
import Collector from "../data/collector.js";
import DataSource from "../data/sources/dataSource.js";
import { VISIT_SKIP } from "../view/view.js";

/**
 * Initializes the view data pipeline: builds the flow graph, awaits fonts,
 * and loads sources.
 *
 * @param {import("../view/view.js").default} viewRoot
 * @param {import("../data/dataFlow.js").default} dataFlow
 * @param {import("../fonts/textMetrics.js").TextMetricsProvider} textMetrics
 * @param {(dataFlow: import("../data/dataFlow.js").default) => void} onDataFlowBuilt
 * @returns {Promise<import("../data/dataFlow.js").default>}
 */
export async function initializeViewData(
    viewRoot,
    dataFlow,
    textMetrics,
    onDataFlowBuilt
) {
    // During initial loading a parameter can change after we selected the sources.
    const context = viewRoot.context;
    let changed = false;
    context.requestVisibilityRefresh = () => {
        changed = true;
    };
    viewRoot.registerDisposer(() => {
        context.requestVisibilityRefresh = undefined;
    });

    const { predicate: visibilityPredicate } =
        getInitializationDependencies(viewRoot);
    const { dataFlow: builtDataFlow } = initializeViewSubtree(
        viewRoot,
        dataFlow,
        visibilityPredicate
    );
    onDataFlowBuilt(builtDataFlow);

    // Have to wait until asynchronous font loading is complete.
    // Text mark's geometry builder and measureText transforms need font metrics
    // before data can be converted into geometries or derived widths.
    // TODO: Replace this subtree-wide wait with consumer-specific waits:
    // await fonts inside text mark graphics updates and before loading data for
    // subtrees that contain measureText transforms.
    await textMetrics.waitUntilReady();
    viewRoot.invalidateSizeCache();

    // Find all data sources and initiate loading.
    await loadViewSubtreeData(
        viewRoot,
        new Set(builtDataFlow.dataSources),
        visibilityPredicate
    );

    while (changed && context.requestVisibilityRefresh) {
        changed = false;
        await refreshVisibility(viewRoot);
    }

    if (context.requestVisibilityRefresh) {
        context.requestVisibilityRefresh = () => {
            if (changed) return;
            changed = true;
            queueMicrotask(() => {
                changed = false;
                if (context.requestVisibilityRefresh) {
                    void refreshVisibility(viewRoot).catch(context.reportError);
                }
            });
        };
    }
    return builtDataFlow;
}

/**
 * A hide takes effect while an earlier first-show load may still be pending.
 * @param {import("../view/view.js").default} root
 */
export async function refreshVisibility(root) {
    const context = root.context;
    root._invalidateCacheByPrefix("size", "progeny");
    root.visit((view) => {
        if (!view.isVisible()) {
            view.facetCoords.clear();
            view.layoutCoords = undefined;
        }
        for (const scale of Object.values(view.resolutions.scale))
            scale.refreshVisibility();
    });
    context.highlightView(null);
    context.requestLayoutReflow();

    await initializeVisibleViewData(
        root,
        context.dataFlow,
        context.textMetrics
    );
    if (context.requestVisibilityRefresh) {
        root._invalidateCacheByPrefix("size", "progeny");
        context.requestLayoutReflow();
    }
}

/**
 * Initializes previously skipped visible views. Mutations can restrict
 * initialization to candidate views and required producers.
 *
 * If a selected view attaches downstream of an already completed collector,
 * the collector is repropagated instead of reloading the source.
 *
 * @param {import("../view/view.js").default} viewRoot
 * @param {import("../data/dataFlow.js").default} dataFlow
 * @param {import("../fonts/textMetrics.js").TextMetricsProvider} textMetrics
 * @param {Iterable<import("../view/view.js").default>} [candidateViews]
 * @returns {Promise<import("../data/dataFlow.js").default>}
 */
export async function initializeVisibleViewData(
    viewRoot,
    dataFlow,
    textMetrics,
    candidateViews
) {
    const candidates = candidateViews && new Set(candidateViews);
    const { predicate: visibilityPredicate, producerPaths } =
        getInitializationDependencies(viewRoot);
    const viewsToInitialize = collectVisibleViews(
        viewRoot,
        visibilityPredicate
    ).filter(
        (view) =>
            (!candidates || candidates.has(view) || producerPaths.has(view)) &&
            view.getDataInitializationState() === "none"
    );

    if (viewsToInitialize.length === 0) {
        return dataFlow;
    }

    const viewsToInitializeSet = new Set(viewsToInitialize);
    const viewInitializationPredicate = (
        /** @type {import("../view/view.js").default} */ view
    ) => viewsToInitializeSet.has(view);

    // Only pre-existing materializations can provide a complete cache. A new
    // collector may receive just the tail of an in-flight load while fonts wait.
    const existingCollectors = new Set(dataFlow.collectors);

    const { dataFlow: builtDataFlow } = initializeViewSubtree(
        viewRoot,
        dataFlow,
        visibilityPredicate,
        viewInitializationPredicate
    );

    // Newly visible subtrees may introduce text marks or measureText transforms
    // that request fonts during initializeViewSubtree.
    await textMetrics.waitUntilReady();
    viewRoot.invalidateSizeCache();

    /** @type {Set<Collector>} */
    const replayRoots = new Set();
    /** @type {Set<DataSource>} */
    const sourcesToLoad = new Set();
    for (const view of viewsToInitialize) {
        for (const endpoint of [
            view.flowHandle?.node,
            ...(view.flowHandle?.terminals ?? []),
            ...(view.flowHandle?.auxiliaryCollectors ?? []),
        ]) {
            let ancestor = endpoint;
            while (
                ancestor &&
                !(ancestor instanceof DataSource) &&
                !(
                    ancestor instanceof Collector &&
                    existingCollectors.has(ancestor)
                )
            ) {
                ancestor = ancestor.parent;
            }

            if (ancestor instanceof Collector && ancestor.completed) {
                replayRoots.add(ancestor);
            } else {
                const source = findAncestorDataSource(ancestor);
                if (source) sourcesToLoad.add(source);
            }
        }
    }

    await loadViewSubtreeData(viewRoot, sourcesToLoad, visibilityPredicate, {
        // Newly attached paths need a complete publication, including
        // when an equivalent source is already loading.
        queueReload: true,
    });

    // Load side inputs before replaying a cached primary. A source load already
    // covers every replay root downstream of that source.
    for (const collector of replayRoots) {
        if (!sourcesToLoad.has(findAncestorDataSource(collector))) {
            collector.repropagate();
        }
    }
    broadcastSubtreeDataReady(viewRoot);

    return builtDataFlow;
}

export { initializeVisibleViewData as initializeViewDataForViews };

/**
 * Visible consumers keep their output producers active, including hidden trees.
 * Include traversal/data ancestry without initializing unrelated hidden siblings.
 * @param {import("../view/view.js").default} root
 */
function getInitializationDependencies(root) {
    // A mutation may start this traversal below a hidden layout ancestor.
    const visible =
        root.layoutParent && !root.layoutParent.isVisible()
            ? []
            : collectVisibleViews(root, (view) => view.isConfiguredVisible());
    const required = new Set(visible);
    const producerPaths = new Set();
    /** @param {import("../view/view.js").default | undefined} view */
    const include = (view) => {
        if (!view || producerPaths.has(view)) return;
        producerPaths.add(view);
        required.add(view);
        include(view.layoutParent);
        include(view.dataParent);
    };
    for (const view of required) {
        for (const output of view.paramRuntime.outputs)
            include(output.producerView);
    }
    return {
        predicate: (/** @type {import("../view/view.js").default} */ view) =>
            required.has(view),
        producerPaths,
    };
}

/**
 * @param {import("../view/view.js").default} viewRoot
 * @param {(view: import("../view/view.js").default) => boolean} viewFilter
 * @returns {import("../view/view.js").default[]}
 */
function collectVisibleViews(viewRoot, viewFilter) {
    /** @type {import("../view/view.js").default[]} */
    const views = [];
    viewRoot.visit((view) => {
        if (!viewFilter(view)) {
            return VISIT_SKIP;
        }
        views.push(view);
    });
    return views;
}
