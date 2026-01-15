import {
    initializeViewSubtree,
    loadViewSubtreeData,
} from "../data/flowInit.js";
import { finalizeSubtreeGraphics } from "../view/viewUtils.js";

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
    const { dataFlow: builtDataFlow, graphicsPromises } = initializeViewSubtree(
        viewRoot,
        dataFlow
    );
    onDataFlowBuilt(builtDataFlow);

    // Have to wait until asynchronous font loading is complete.
    // Text mark's geometry builder needs font metrics before data can be
    // converted into geometries.
    // TODO: Make updateGraphicsData async and await font loading there.
    await fontManager.waitUntilReady();

    // Find all data sources and initiate loading.
    await loadViewSubtreeData(viewRoot, new Set(builtDataFlow.dataSources));

    await finalizeSubtreeGraphics(graphicsPromises);

    return builtDataFlow;
}
