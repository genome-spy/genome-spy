import {
    initializeViewSubtree,
    loadViewSubtreeData,
} from "../data/flowInit.js";
import { finalizeSubtreeGraphics } from "../view/viewUtils.js";
import { VISIT_SKIP } from "../view/view.js";

/**
 * Initializes the view data pipeline: builds the flow graph, awaits fonts,
 * loads sources, and finalizes graphics for rendering.
 *
 * @param {import("../view/view.js").default} viewRoot
 * @param {import("../data/dataFlow.js").default} dataFlow
 * @param {import("../fonts/bmFontManager.js").default} fontManager
 * @param {(dataFlow: import("../data/dataFlow.js").default) => void} onDataFlowBuilt
 * @returns {Promise<import("../data/dataFlow.js").default>}
 */
export async function initializeViewData(
    viewRoot,
    dataFlow,
    fontManager,
    onDataFlowBuilt
) {
    const viewPredicate = (
        /** @type {import("../view/view.js").default} */ view
    ) => view.isConfiguredVisible();
    const { dataFlow: builtDataFlow, graphicsPromises } = initializeViewSubtree(
        viewRoot,
        dataFlow,
        viewPredicate
    );
    onDataFlowBuilt(builtDataFlow);

    // Have to wait until asynchronous font loading is complete.
    // Text mark's geometry builder needs font metrics before data can be
    // converted into geometries.
    // TODO: Make updateGraphicsData async and await font loading there.
    await fontManager.waitUntilReady();

    // Find all data sources and initiate loading.
    await loadViewSubtreeData(
        viewRoot,
        new Set(builtDataFlow.dataSources),
        viewPredicate
    );

    await finalizeSubtreeGraphics(graphicsPromises);

    return builtDataFlow;
}

/**
 * Initializes data flow and graphics for visible views that were previously
 * skipped. Intended for view-visibility toggles.
 *
 * @param {import("../view/view.js").default} viewRoot
 * @param {import("../data/dataFlow.js").default} dataFlow
 * @param {import("../fonts/bmFontManager.js").default} fontManager
 * @returns {Promise<import("../data/dataFlow.js").default>}
 */
export async function initializeVisibleViewData(
    viewRoot,
    dataFlow,
    fontManager
) {
    const viewPredicate = (
        /** @type {import("../view/view.js").default} */ view
    ) => view.isConfiguredVisible();
    const visibleViews = collectVisibleViews(viewRoot, viewPredicate);
    const viewsToInitialize = visibleViews.filter(
        (view) => view.getDataInitializationState() === "none"
    );

    if (viewsToInitialize.length === 0) {
        return dataFlow;
    }

    const viewsToInitializeSet = new Set(viewsToInitialize);
    const viewInitializationPredicate = (
        /** @type {import("../view/view.js").default} */ view
    ) => viewsToInitializeSet.has(view);

    const { dataFlow: builtDataFlow, graphicsPromises } = initializeViewSubtree(
        viewRoot,
        dataFlow,
        viewPredicate,
        viewInitializationPredicate
    );

    await fontManager.waitUntilReady();

    const dataSourceRoots = collectDataSourceRoots(viewsToInitialize);
    await Promise.all(
        Array.from(dataSourceRoots.entries()).map(
            ([subtreeRoot, dataSources]) =>
                loadViewSubtreeData(subtreeRoot, dataSources)
        )
    );

    await finalizeSubtreeGraphics(graphicsPromises);

    return builtDataFlow;
}

/**
 * @param {import("../view/view.js").default} viewRoot
 * @param {(view: import("../view/view.js").default) => boolean} viewPredicate
 * @returns {import("../view/view.js").default[]}
 */
function collectVisibleViews(viewRoot, viewPredicate) {
    /** @type {import("../view/view.js").default[]} */
    const views = [];
    viewRoot.visit((view) => {
        if (!viewPredicate(view)) {
            return VISIT_SKIP;
        }
        views.push(view);
    });
    return views;
}

/**
 * @param {import("../view/view.js").default[]} views
 * @returns {Map<import("../view/view.js").default, Set<import("../data/sources/dataSource.js").default>>}
 */
function collectDataSourceRoots(views) {
    /** @type {Map<import("../view/view.js").default, Set<import("../data/sources/dataSource.js").default>>} */
    const roots = new Map();

    for (const view of views) {
        let current = view;
        while (current && !current.flowHandle?.dataSource) {
            current = current.dataParent;
        }

        if (!current?.flowHandle?.dataSource) {
            throw new Error(
                "No data source found for view " + view.getPathString()
            );
        }

        let dataSources = roots.get(current);
        if (!dataSources) {
            dataSources = new Set();
            roots.set(current, dataSources);
        }
        dataSources.add(current.flowHandle.dataSource);
    }

    return roots;
}
