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

/** @type {WeakMap<View, Promise<DataFlow>>} */
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

    const { required } = getInitializationDependencies(viewRoot);
    const visibilityPredicate = (/** @type {View} */ view) =>
        required.has(view);
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

    const { required } = getInitializationDependencies(root);
    const visible = (/** @type {View} */ view) => required.has(view);
    const reflowAfterLoading = () => {
        if (!context.requestVisibilityRefresh) return;
        root._invalidateCacheByPrefix("size", "progeny");
        context.requestLayoutReflow();
    };
    if (affected) {
        // Include existing inputs so the affected views can attach to them.
        initializeBatch(
            root,
            (view) =>
                visible(view) &&
                (affected.has(view) ||
                    view.getDataInitializationState() !== "none")
        );
        void initializeBatch(root, visible)
            ?.then(reflowAfterLoading)
            .catch(context.reportError);
        const pending = affected
            .values()
            .map((view) => pendingInitializations.get(view));
        await Promise.all(new Set(pending));
    } else {
        await initializeBatch(root, visible);
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
    const { required, producerPaths } = getInitializationDependencies(viewRoot);
    const visible = (/** @type {View} */ view) => required.has(view);
    const candidates =
        candidateViews && new Set([...candidateViews, ...producerPaths]);
    return (
        initializeBatch(viewRoot, visible, candidates, {
            dataFlow,
            textMetrics,
        }) ?? Promise.resolve(dataFlow)
    );
}

/**
 * @param {View} viewRoot
 * @param {(view: View) => boolean} visibilityPredicate
 * @param {ReadonlySet<View>} [candidates]
 * @param {Pick<import("../types/viewContext.js").default, "dataFlow" | "textMetrics">} [context]
 */
function initializeBatch(
    viewRoot,
    visibilityPredicate,
    candidates,
    { dataFlow, textMetrics } = viewRoot.context
) {
    const views = collectSubtreeViews(viewRoot, visibilityPredicate);
    const viewsToInitialize = new Set(
        views
            .values()
            .filter(
                (view) =>
                    (!candidates || candidates.has(view)) &&
                    view.getDataInitializationState() === "none"
            )
    );

    if (!viewsToInitialize.size) return;

    const completion = load().finally(() => {
        for (const view of viewsToInitialize)
            pendingInitializations.delete(view);
    });
    for (const view of viewsToInitialize)
        pendingInitializations.set(view, completion);
    return completion;

    async function load() {
        // Only pre-existing materializations can provide a complete cache. A new
        // collector may receive just the tail of an in-flight load while fonts wait.
        const existingCollectors = new Set(dataFlow.collectors);

        const { dataFlow: builtDataFlow } = initializeViewSubtree(
            viewRoot,
            dataFlow,
            visibilityPredicate,
            (view) => viewsToInitialize.has(view)
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
                while (ancestor && !(ancestor instanceof DataSource)) {
                    if (
                        ancestor instanceof Collector &&
                        existingCollectors.has(ancestor)
                    )
                        break;
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

        await loadViewSubtreeData(
            viewRoot,
            sourcesToLoad,
            visibilityPredicate,
            {
                // Newly attached paths need a complete publication, including
                // when an equivalent source is already loading.
                queueReload: true,
            }
        );

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
    return { required, producerPaths };
}
