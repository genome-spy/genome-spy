import UnitView from "../view/unitView.js";
import { buildDataFlow } from "../view/flowBuilder.js";
import { optimizeDataFlow } from "./flowOptimizer.js";

/**
 * @param {import("../view/view.js").default} root
 * @param {import("./dataFlow.js").default} [existingFlow]
 */
export async function initializeData(root, existingFlow) {
    const flow = buildDataFlow(root, existingFlow);
    const canonicalBySource = optimizeDataFlow(flow);
    syncFlowHandles(root, canonicalBySource);
    flow.initialize();

    /** @type {Promise<void>[]} */
    const promises = flow.dataSources.map(
        (/** @type {import("./sources/dataSource.js").default} */ dataSource) =>
            dataSource.load()
    );

    await Promise.all(promises);

    return flow;
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
 *
 * TODO:
 * - add a load-state/cache so shared canonical sources load once
 * - emit subtree-level "data ready" events that respect nearest-source
 *   boundaries, rather than relying on global dataLoaded broadcasts
 * - reconfigure scales automatically after subtree data load
 * - integrate with async font readiness for text marks
 * - unify observer wiring via a disposable registry across view types
 *
 * @param {import("../view/view.js").default} subtreeRoot
 * @param {import("./dataFlow.js").default} flow
 * @returns {{
 *     dataFlow: import("./dataFlow.js").default,
 *     unitViews: UnitView[],
 *     dataSources: Set<import("./sources/dataSource.js").default>,
 *     graphicsPromises: Promise<import("../marks/mark.js").default>[]
 * }}
 */
export function initializeViewSubtree(subtreeRoot, flow) {
    const dataFlow = buildDataFlow(subtreeRoot, flow);
    const canonicalBySource = optimizeDataFlow(dataFlow);
    syncFlowHandles(subtreeRoot, canonicalBySource);
    const subtreeViews = subtreeRoot.getDescendants();
    /** @type {Set<import("./sources/dataSource.js").default>} */
    const dataSources = new Set();
    for (const view of subtreeViews) {
        // Walk up to the nearest view that owns a data source.
        let current = view;
        while (current && !current.flowHandle?.dataSource) {
            current = current.dataParent;
        }
        if (current?.flowHandle?.dataSource) {
            dataSources.add(current.flowHandle.dataSource);
        }
    }

    // Initialize flow nodes for the sources that belong to this subtree.
    for (const dataSource of dataSources) {
        dataSource.visit((node) => node.initialize());
    }

    /** @type {UnitView[]} */
    const unitViews = subtreeViews.filter((view) => view instanceof UnitView);

    /** @type {Promise<import("../marks/mark.js").default>[]} */
    const graphicsPromises = [];

    const canInitializeGraphics = !!subtreeRoot.context.glHelper;

    for (const view of unitViews) {
        const mark = view.mark;
        // Encoders can be initialized immediately; graphics need a GL context.
        mark.initializeEncoders();
        if (canInitializeGraphics) {
            graphicsPromises.push(mark.initializeGraphics().then(() => mark));
        }

        // Wire collector completion to mark data/graphics updates.
        const observer = (
            /** @type {import("./collector.js").default} */ _collector
        ) => {
            mark.initializeData(); // does faceting
            if (canInitializeGraphics) {
                mark.updateGraphicsData();
            }
        };
        view.registerDisposer(view.flowHandle.collector.observe(observer));
    }

    return {
        dataFlow,
        unitViews,
        dataSources,
        graphicsPromises,
    };
}
