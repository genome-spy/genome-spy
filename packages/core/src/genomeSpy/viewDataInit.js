import {
    broadcastSubtreeDataReady,
    collectViewSubtreeDataSources,
    findAncestorDataSource,
    initializeViewSubtree,
    loadViewSubtreeData,
} from "../data/flowInit.js";
import { hasAuxiliaryDataInput } from "../data/transforms/auxiliaryData.js";
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

    /** @type {Set<import("../data/collector.js").default>} */
    const replayRoots = new Set();
    /** @type {import("../view/view.js").default[]} */
    const viewsNeedingLoad = [];
    for (const view of viewsToInitialize) {
        if (
            view.spec.data ||
            view.spec.transform?.some(hasAuxiliaryDataInput)
        ) {
            viewsNeedingLoad.push(view);
            continue;
        }
        const collector = findCompletedAncestorCollector(view);
        if (collector) {
            replayRoots.add(collector);
        } else {
            viewsNeedingLoad.push(view);
        }
    }

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

    for (const collector of replayRoots) {
        collector.repropagate();
    }

    const sourcesToLoad = collectViewSubtreeDataSources(viewsNeedingLoad);
    const replayPaths =
        /** @type {ReadonlySet<import("../data/flowNode.js").default>} */ (
            replayRoots
        );
    // An independent branch can need loading even when its main rows replay
    // from a completed collector. Inherited branches use that same replay.
    for (const view of viewsToInitialize) {
        for (const endpoint of [
            ...(view.flowHandle?.terminals ?? []),
            ...(view.flowHandle?.auxiliaryCollectors ?? []),
        ]) {
            let ancestor = endpoint;
            while (ancestor && !replayPaths.has(ancestor))
                ancestor = ancestor.parent;
            if (!ancestor) {
                const source = findAncestorDataSource(endpoint);
                if (source) sourcesToLoad.add(source);
            }
        }
    }

    /** @type {Map<import("../view/view.js").default, Set<import("../data/sources/dataSource.js").default>>} */
    const dataSourceRoots = new Map();
    for (const source of sourcesToLoad) {
        let sources = dataSourceRoots.get(source.view);
        if (!sources) dataSourceRoots.set(source.view, (sources = new Set()));
        sources.add(source);
    }
    await Promise.all(
        Array.from(dataSourceRoots, ([subtreeRoot, dataSources]) =>
            loadViewSubtreeData(subtreeRoot, dataSources, undefined, {
                // Newly attached paths need a complete publication, including
                // when an equivalent source is already loading.
                queueReload: true,
            })
        )
    );
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

/**
 * Finds the nearest completed collector in the dataParent chain.
 *
 * @param {import("../view/view.js").default} view
 * @returns {import("../data/collector.js").default | undefined}
 */
function findCompletedAncestorCollector(view) {
    let current = view.dataParent;
    while (current) {
        const collector = current.flowHandle?.collector;
        if (collector) {
            return collector.completed ? collector : undefined;
        }
        current = current.dataParent;
    }
    return undefined;
}
