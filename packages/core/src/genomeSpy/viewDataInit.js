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

    return builtDataFlow;
}

/**
 * Initializes data flow for visible views that were previously
 * skipped. Intended for view-visibility toggles.
 *
 * @param {import("../view/view.js").default} viewRoot
 * @param {import("../data/dataFlow.js").default} dataFlow
 * @param {import("../fonts/textMetrics.js").TextMetricsProvider} textMetrics
 * @returns {Promise<import("../data/dataFlow.js").default>}
 */
export async function initializeVisibleViewData(
    viewRoot,
    dataFlow,
    textMetrics
) {
    const { predicate: visibilityPredicate } =
        getInitializationDependencies(viewRoot);
    const visibleViews = collectVisibleViews(viewRoot, visibilityPredicate);
    const viewsToInitialize = visibleViews.filter(
        (view) => view.getDataInitializationState() === "none"
    );

    return initializeViewDataForViews(
        viewRoot,
        dataFlow,
        textMetrics,
        viewsToInitialize
    );
}

/**
 * Initializes dataflow for selected views while avoiding unnecessary
 * data source reloads.
 *
 * If a selected view attaches downstream of an already completed collector,
 * the collector is repropagated instead of reloading the source.
 *
 * @param {import("../view/view.js").default} viewRoot
 * @param {import("../data/dataFlow.js").default} dataFlow
 * @param {import("../fonts/textMetrics.js").TextMetricsProvider} textMetrics
 * @param {Iterable<import("../view/view.js").default>} candidateViews
 * @returns {Promise<import("../data/dataFlow.js").default>}
 */
export async function initializeViewDataForViews(
    viewRoot,
    dataFlow,
    textMetrics,
    candidateViews
) {
    const candidates = new Set(candidateViews);
    const { predicate: visibilityPredicate, producerPaths } =
        getInitializationDependencies(viewRoot);
    const viewsToInitialize = collectVisibleViews(
        viewRoot,
        visibilityPredicate
    ).filter(
        (view) =>
            (candidates.has(view) || producerPaths.has(view)) &&
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

/**
 * Visible consumers keep their output producers active, including hidden trees.
 * Include traversal/data ancestry without initializing unrelated hidden siblings.
 * @param {import("../view/view.js").default} root
 */
function getInitializationDependencies(root) {
    const visible = collectVisibleViews(root, (view) =>
        view.isConfiguredVisible()
    );
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
