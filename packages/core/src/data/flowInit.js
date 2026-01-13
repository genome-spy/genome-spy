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
 * Initializes data flow and marks for a subtree without reinitializing the whole view tree.
 *
 * @param {import("../view/view.js").default} root
 * @param {import("./dataFlow.js").default} flow
 * @returns {{
 *     dataFlow: import("./dataFlow.js").default,
 *     unitViews: UnitView[],
 *     dataSources: Set<import("./sources/dataSource.js").default>,
 *     graphicsPromises: Promise<import("../marks/mark.js").default>[]
 * }}
 */
export function initializeSubtree(root, flow) {
    const dataFlow = buildDataFlow(root, flow);
    const canonicalBySource = optimizeDataFlow(dataFlow);
    syncFlowHandles(root, canonicalBySource);
    const subtreeViews = root.getDescendants();
    /** @type {Set<import("./sources/dataSource.js").default>} */
    const dataSources = new Set();
    for (const view of subtreeViews) {
        let current = view;
        while (current && !current.flowHandle?.dataSource) {
            current = current.dataParent;
        }
        if (current?.flowHandle?.dataSource) {
            dataSources.add(current.flowHandle.dataSource);
        }
    }

    for (const dataSource of dataSources) {
        dataSource.visit((node) => node.initialize());
    }

    /** @type {UnitView[]} */
    const unitViews = subtreeViews.filter((view) => view instanceof UnitView);

    /** @type {Promise<import("../marks/mark.js").default>[]} */
    const graphicsPromises = [];

    const canInitializeGraphics = !!root.context.glHelper;

    for (const view of unitViews) {
        const mark = view.mark;
        mark.initializeEncoders();
        if (canInitializeGraphics) {
            graphicsPromises.push(mark.initializeGraphics().then(() => mark));
        }

        flow.addObserver(
            view.flowHandle.collector,
            (/** @type {import("./collector.js").default} */ _collector) => {
                mark.initializeData(); // does faceting
                mark.updateGraphicsData();
            },
            view.flowHandle
        );
    }

    return {
        dataFlow,
        unitViews,
        dataSources,
        graphicsPromises,
    };
}
