import UnitView from "../view/unitView.js";
import { buildDataFlow } from "../view/flowBuilder.js";
import { optimizeDataFlow } from "./flowOptimizer.js";
import { VISIT_SKIP } from "../view/view.js";

/** @type {WeakMap<import("./sources/dataSource.js").default, Promise<void>>} */
const inFlightLoads = new WeakMap();
/** @type {WeakMap<import("./sources/dataSource.js").default, Promise<void>>} */
const queuedReloads = new WeakMap();

/**
 * Deduplicate concurrent loads for shared sources without changing propagation.
 *
 * Data sources still propagate rows immediately during `load()`/`loadSynchronously`
 * and do not retain data. This helper only prevents overlapping `load()` calls
 * from running twice; collectors remain the sole in-memory cache. Once the load
 * promise settles, the source may be loaded again later as usual.
 *
 * @param {import("./sources/dataSource.js").default} dataSource
 * @param {{ queueReload?: boolean }} [options]
 * @returns {Promise<void>}
 */
function loadDataSourceOnce(dataSource, options) {
    const existing = inFlightLoads.get(dataSource);
    if (existing) {
        if (!options?.queueReload) {
            return existing;
        }
        const queued = queuedReloads.get(dataSource);
        if (queued) {
            return queued;
        }
        const reload = existing
            .catch(
                /** @returns {void} */ () => {
                    // Nop: ensure a queued reload can proceed after a failure.
                }
            )
            .then(() => loadDataSourceOnce(dataSource))
            .finally(() => {
                queuedReloads.delete(dataSource);
            });
        queuedReloads.set(dataSource, reload);
        return reload;
    }

    const loadPromise = Promise.resolve()
        .then(() => dataSource.load())
        .finally(() => {
            inFlightLoads.delete(dataSource);
        });

    inFlightLoads.set(dataSource, loadPromise);
    return loadPromise;
}

/**
 * Synchronize flow handles after data flow optimization.
 *
 * @param {import("../view/view.js").default} root
 * @param {Map<import("./sources/dataSource.js").default, import("./sources/dataSource.js").default>} canonicalBySource
 */
export function syncFlowHandles(root, canonicalBySource) {
    for (const view of root.getDescendants()) {
        const handle = view.flowHandle;
        if (!handle) {
            continue;
        }

        const dataSource = handle.dataSource;
        if (dataSource) {
            handle.dataSource = canonicalBySource.get(dataSource) ?? dataSource;
        }
    }
}

/**
 * Initializes data flow and mark wiring for a subtree without rebuilding the
 * entire view hierarchy. This is the primary entry point for dynamic view
 * insertion: build the subtree fully, call this, then attach the subtree to
 * the live hierarchy.
 *
 * What it does:
 * - builds/extends the dataflow graph for the subtree
 * - runs flow optimization and syncs flow handles to canonical data sources
 * - discovers the nearest data sources for views in the subtree
 * - initializes dataflow nodes (initialize) for those sources
 * - initializes mark encoders for unit views
 * - queues graphics initialization (if a GL context exists)
 * - wires collector observers so marks update on data arrival
 *
 * How to use it:
 * - call after the subtree is fully constructed (post-order build)
 * - do not attach the subtree to the live hierarchy until after this call
 * - dispose the old subtree before replacing it to prevent observer leaks
 * - follow up with finalizeSubtreeGraphics(...) once graphics promises resolve
 * - reconfigure scales for the subtree when data loads complete
 *
 * Considerations:
 * - this does not trigger data loading; callers decide when to load
 * - data sources are derived by walking to the nearest ancestor source; nested
 *   sources should be treated as boundaries (do not walk past them)
 * - only call updateGraphicsData when graphics are initialized or a GL context
 *   is available; headless/test contexts must avoid WebGL usage
 * - loadViewSubtreeData emits a subtree-scoped "subtreeDataReady" broadcast
 *
 * TODO:
 * - promote in-flight load caching to a persistent load-state per source
 * - replace global dataLoaded usage with subtree-scoped readiness
 * - integrate with async font readiness for text marks
 * - unify observer wiring via a disposable registry across view types
 *
 * @param {import("../view/view.js").default} subtreeRoot
 * @param {import("./dataFlow.js").default} flow
 * @param {(view: import("../view/view.js").default) => boolean} [viewFilter]
 * @param {(view: import("../view/view.js").default) => boolean} [viewInitializationPredicate]
 * @returns {{
 *     dataFlow: import("./dataFlow.js").default,
 *     unitViews: UnitView[],
 *     dataSources: Set<import("./sources/dataSource.js").default>,
 *     graphicsPromises: Promise<import("../marks/mark.js").default>[]
 * }}
 */
export function initializeViewSubtree(
    subtreeRoot,
    flow,
    viewFilter,
    viewInitializationPredicate
) {
    const shouldInitializeView = viewInitializationPredicate ?? (() => true);
    const subtreeViews = collectSubtreeViews(subtreeRoot, viewFilter);
    const viewsToInitialize = subtreeViews.filter(shouldInitializeView);
    if (viewsToInitialize.length === 0) {
        return {
            dataFlow: flow,
            unitViews: [],
            dataSources: new Set(),
            graphicsPromises: [],
        };
    }

    const viewsToInitializeSet = new Set(viewsToInitialize);
    for (const view of viewsToInitialize) {
        view._setDataInitializationState("pending");
    }

    let dataFlow;
    try {
        dataFlow = buildDataFlow(subtreeRoot, flow, viewFilter, (view) =>
            viewsToInitializeSet.has(view)
        );
        const canonicalBySource = optimizeDataFlow(dataFlow);
        syncFlowHandles(subtreeRoot, canonicalBySource);
    } catch (error) {
        for (const view of viewsToInitialize) {
            view._setDataInitializationState("none");
        }
        throw error;
    }

    const dataSources = collectViewSubtreeDataSources(viewsToInitialize);

    // Initialize flow nodes for the sources that belong to this subtree.
    for (const dataSource of dataSources) {
        dataSource.visit((node) => node.initialize());
    }

    /** @type {UnitView[]} */
    const unitViews = viewsToInitialize.filter(
        (view) => view instanceof UnitView
    );

    /** @type {Promise<import("../marks/mark.js").default>[]} */
    const graphicsPromises = [];

    const canInitializeGraphics = !!subtreeRoot.context.glHelper;

    for (const view of unitViews) {
        const mark = view.mark;
        // Encoders can be initialized immediately; graphics need a GL context.
        mark.initializeEncoders();
        view.registerDomainSubscriptions();
        if (canInitializeGraphics) {
            graphicsPromises.push(mark.initializeGraphics().then(() => mark));
        }

        // Wire collector completion to mark data/graphics updates.
        const observer = (
            /** @type {import("./collector.js").default} */ _collector
        ) => {
            mark.initializeData(); // does faceting
            if (canInitializeGraphics) {
                try {
                    mark.updateGraphicsData();
                } catch (e) {
                    e.view = view;
                    throw e;
                }
            }
            view.context.animator.requestRender();
        };
        view.registerDisposer(view.flowHandle.collector.observe(observer));
    }

    for (const view of viewsToInitialize) {
        view._setDataInitializationState("ready");
    }

    return {
        dataFlow,
        unitViews,
        dataSources,
        graphicsPromises,
    };
}

/**
 * Collects data sources needed to initialize all views in the subtree.
 * This includes sources that are overridden deeper in the hierarchy.
 *
 * @param {import("../view/view.js").default | import("../view/view.js").default[]} subtreeRoot
 * @param {(view: import("../view/view.js").default) => boolean} [viewFilter]
 * @returns {Set<import("./sources/dataSource.js").default>}
 */
export function collectViewSubtreeDataSources(subtreeRoot, viewFilter) {
    const subtreeViews = Array.isArray(subtreeRoot)
        ? subtreeRoot
        : collectSubtreeViews(subtreeRoot, viewFilter);
    /** @type {Set<import("./sources/dataSource.js").default>} */
    const dataSources = new Set();
    for (const view of subtreeViews) {
        if (viewFilter && !viewFilter(view)) {
            continue;
        }
        // Walk up to the nearest view that owns a data source.
        let current = view;
        while (current && !current.flowHandle?.dataSource) {
            current = current.dataParent;
        }
        if (current?.flowHandle?.dataSource) {
            dataSources.add(current.flowHandle.dataSource);
        }
    }
    return dataSources;
}

/**
 * Collects the nearest data sources under a subtree root.
 * These sources define data-ready boundaries for subtree-level loading.
 *
 * @param {import("../view/view.js").default} subtreeRoot
 * @param {(view: import("../view/view.js").default) => boolean} [viewFilter]
 * @returns {Set<import("./sources/dataSource.js").default>}
 */
export function collectNearestViewSubtreeDataSources(subtreeRoot, viewFilter) {
    /** @type {Set<import("./sources/dataSource.js").default>} */
    const dataSources = new Set();
    subtreeRoot.visit((view) => {
        if (viewFilter && !viewFilter(view)) {
            return VISIT_SKIP;
        }
        if (view.flowHandle?.dataSource) {
            dataSources.add(view.flowHandle.dataSource);
            return VISIT_SKIP;
        }
    });
    return dataSources;
}

/**
 * Loads the nearest data sources for a subtree.
 * Use the returned promise as a subtree-level "data ready" signal.
 *
 * @param {import("../view/view.js").default} subtreeRoot
 * @param {Set<import("./sources/dataSource.js").default>} [dataSources]
 * @param {(view: import("../view/view.js").default) => boolean} [viewFilter]
 * @param {{ queueReload?: boolean }} [loadOptions]
 * @returns {Promise<void[]>}
 */
export function loadViewSubtreeData(
    subtreeRoot,
    dataSources,
    viewFilter,
    loadOptions
) {
    if (!dataSources) {
        dataSources = collectNearestViewSubtreeDataSources(
            subtreeRoot,
            viewFilter
        );
    }
    return Promise.all(
        Array.from(dataSources).map((dataSource) =>
            loadDataSourceOnce(dataSource, loadOptions)
        )
    ).then((results) => {
        broadcastSubtreeDataReady(subtreeRoot);
        return results;
    });
}

/**
 * @param {import("../view/view.js").default} subtreeRoot
 * @param {(view: import("../view/view.js").default) => boolean} [viewFilter]
 * @returns {import("../view/view.js").default[]}
 */
function collectSubtreeViews(subtreeRoot, viewFilter) {
    /** @type {import("../view/view.js").default[]} */
    const views = [];
    if (!viewFilter) {
        return subtreeRoot.getDescendants();
    }
    subtreeRoot.visit((view) => {
        if (!viewFilter(view)) {
            return VISIT_SKIP;
        }
        views.push(view);
    });
    return views;
}

/**
 * Broadcasts a subtree-scoped data-ready event to views within the subtree.
 *
 * @param {import("../view/view.js").default} subtreeRoot
 */
function broadcastSubtreeDataReady(subtreeRoot) {
    /** @type {import("../view/view.js").BroadcastMessage} */
    const message = {
        type: /** @type {import("../genomeSpy.js").BroadcastEventType} */ (
            "subtreeDataReady"
        ),
        payload: { subtreeRoot },
    };
    subtreeRoot.visit((view) => view.handleBroadcast(message));
}
