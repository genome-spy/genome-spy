import {
    broadcastSubtreeDataReady,
    findAncestorDataSource,
    initializeViewSubtree,
    loadViewSubtreeData,
} from "../data/flowInit.js";
import Collector from "../data/collector.js";
import DataSource from "../data/sources/dataSource.js";
import { collectSubtreeViews } from "../view/flowBuilder.js";

/** @typedef {import("../view/view.js").default} View */
/** @typedef {import("../data/dataFlow.js").default} DataFlow */

/** @type {WeakMap<import("../types/viewContext.js").default, Map<View, Promise<DataFlow>>>} */
const pendingInitializations = new WeakMap();

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
        context.requestVisibilityRefresh = (affected) => {
            if (affected) {
                changed = false;
                return refreshVisibility(viewRoot, affected);
            }
            if (changed) return;
            changed = true;
            queueMicrotask(() => {
                if (changed && context.requestVisibilityRefresh) {
                    changed = false;
                    void refreshVisibility(viewRoot).catch(context.reportError);
                }
            });
        };
    }
    return builtDataFlow;
}

/**
 * Also awaits branches a previous refresh has wired but is still loading.
 * @param {View} root
 * @param {View} target
 * @param {() => void} write
 */
export async function applyVisibilityUpdate(root, target, write) {
    const { required: before } = getInitializationDependencies(root);
    write();
    const subtree = new Set(target.getDescendants());
    const { required: affected } = getInitializationDependencies(
        root,
        (view) => subtree.has(view) || !before.has(view)
    );
    await (root.context.requestVisibilityRefresh?.(affected) ||
        refreshVisibility(root, affected));
}

/**
 * A hide takes effect while an earlier first-show load may still be pending.
 * @param {View} root
 * @param {ReadonlySet<View>} [affected]
 */
export async function refreshVisibility(root, affected) {
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

    const { predicate } = getInitializationDependencies(root);
    const reflowAfterLoading = () => {
        if (context.requestVisibilityRefresh) {
            root._invalidateCacheByPrefix("size", "progeny");
            context.requestLayoutReflow();
        }
    };
    /** @param {(view: View) => boolean} filter */
    const initialize = (filter) => startVisibleInitialization(root, filter);
    if (affected) {
        // Keep unrelated first shows out of this write's batch. Already-wired
        // views remain available as inputs while either batch attaches.
        initialize(
            (view) =>
                predicate(view) &&
                (affected.has(view) ||
                    view.getDataInitializationState() !== "none")
        );
        const pending = pendingInitializations.get(context);
        void initialize(predicate)
            ?.then(reflowAfterLoading)
            .catch(context.reportError);
        await Promise.all(
            new Set(affected.keys().map((view) => pending?.get(view)))
        );
    } else {
        await initialize(predicate);
    }
    reflowAfterLoading();
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
export function initializeVisibleViewData(
    viewRoot,
    dataFlow,
    textMetrics,
    candidateViews
) {
    const candidates = candidateViews && new Set(candidateViews);
    const { predicate: visibilityPredicate, producerPaths } =
        getInitializationDependencies(viewRoot);
    return (
        startVisibleInitialization(
            viewRoot,
            visibilityPredicate,
            (view) =>
                !candidates || candidates.has(view) || producerPaths.has(view),
            dataFlow,
            textMetrics
        ) ?? Promise.resolve(dataFlow)
    );
}

/**
 * @param {View} viewRoot
 * @param {(view: View) => boolean} visibilityPredicate
 * @param {(view: View) => boolean} [select]
 * @param {DataFlow} [dataFlow]
 * @param {import("../fonts/textMetrics.js").TextMetricsProvider} [textMetrics]
 */
function startVisibleInitialization(
    viewRoot,
    visibilityPredicate,
    select,
    dataFlow = viewRoot.context.dataFlow,
    textMetrics = viewRoot.context.textMetrics
) {
    const viewsToInitialize = collectSubtreeViews(
        viewRoot,
        visibilityPredicate
    ).filter(
        (view) =>
            (!select || select(view)) &&
            view.getDataInitializationState() === "none"
    );

    if (!viewsToInitialize.length) return;

    let pending = pendingInitializations.get(viewRoot.context);
    if (!pending) {
        pending = new Map();
        pendingInitializations.set(viewRoot.context, pending);
    }
    const completion = initializeNewlyVisibleViews(
        viewRoot,
        dataFlow,
        textMetrics,
        visibilityPredicate,
        viewsToInitialize
    ).finally(() => {
        for (const view of viewsToInitialize) pending.delete(view);
    });
    for (const view of viewsToInitialize) pending.set(view, completion);
    return completion;
}

/**
 * @param {View} viewRoot
 * @param {DataFlow} dataFlow
 * @param {import("../fonts/textMetrics.js").TextMetricsProvider} textMetrics
 * @param {(view: View) => boolean} visibilityPredicate
 * @param {View[]} viewsToInitialize
 */
async function initializeNewlyVisibleViews(
    viewRoot,
    dataFlow,
    textMetrics,
    visibilityPredicate,
    viewsToInitialize
) {
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
 * @param {View} root
 * @param {(view: View) => boolean} [selected]
 */
function getInitializationDependencies(root, selected) {
    // A mutation may start this traversal below a hidden layout ancestor.
    const visible =
        root.layoutParent && !root.layoutParent.isVisible()
            ? []
            : collectSubtreeViews(root, (view) => view.isConfiguredVisible());
    const required = new Set(selected ? visible.filter(selected) : visible);
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
        required,
    };
}
