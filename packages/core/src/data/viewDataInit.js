import { initializeViewSubtree, loadViewSubtreeData } from "./flowInit.js";
import { finalizeSubtreeGraphics } from "../view/viewUtils.js";

/**
 * @param {import("../view/view.js").default} viewRoot
 * @param {import("./dataFlow.js").default} dataFlow
 * @param {import("../fonts/bmFontManager.js").default} fontManager
 * @param {(dataFlow: import("./dataFlow.js").default) => void} onDataFlowBuilt
 * @returns {Promise<import("./dataFlow.js").default>}
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
