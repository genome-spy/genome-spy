import {
    createTopLevelDatasetApi,
    createViewMutationApi,
} from "./view/viewMutationApi.js";
import { createEmbedParamNamespace } from "./paramRuntime/embedParamApi.js";
import { getTopLevelSpecView } from "./view/viewFactory.js";

/**
 * Creates the common result object returned by Core and App embedding.
 *
 * The caller owns launch and finalization because App has additional plugin
 * and UI resources to release. This helper owns the shared public surface.
 *
 * @param {object} options
 * @param {import("./genomeSpy.js").default} options.genomeSpy
 * @param {() => boolean} options.isActive
 * @param {import("./types/embedApi.js").EmbedDebugApi} options.debug
 * @param {() => void} options.finalize
 * @returns {import("./types/embedApi.js").EmbedResult}
 */
export function createEmbedResult({ genomeSpy, isActive, debug, finalize }) {
    return {
        views: createViewMutationApi(genomeSpy, isActive),
        datasets: createTopLevelDatasetApi(genomeSpy, isActive),
        events: {
            subscribe(type, listener) {
                if (!isActive()) {
                    throw new Error(
                        "Cannot subscribe to events through a finalized embed."
                    );
                }
                return genomeSpy.subscribeNativeEvent(type, listener);
            },
        },
        params: createEmbedParamNamespace(
            getTopLevelSpecView(genomeSpy.viewRoot)
        ),

        finalize,

        addEventListener(type, listener) {
            genomeSpy.addEventListener(type, listener);
        },

        removeEventListener(type, listener) {
            genomeSpy.removeEventListener(type, listener);
        },

        getScaleResolutionByName(name) {
            return genomeSpy.getNamedScaleResolutions().get(name);
        },

        getParam: genomeSpy.getParam.bind(genomeSpy),

        awaitVisibleLazyData: genomeSpy.awaitVisibleLazyData.bind(genomeSpy),
        getRenderedBounds: genomeSpy.getRenderedBounds.bind(genomeSpy),
        updateNamedData: genomeSpy.updateNamedData.bind(genomeSpy),
        getLogicalCanvasSize: genomeSpy.getLogicalCanvasSize.bind(genomeSpy),
        exportCanvas: genomeSpy.exportCanvas.bind(genomeSpy),
        imageExport: {
            raster: genomeSpy.exportRaster.bind(genomeSpy),
            svg: genomeSpy.exportSvg.bind(genomeSpy),
            analyzeSvg: genomeSpy.analyzeSvgExport.bind(genomeSpy),
        },
        debug,
    };
}

/**
 * Removes all DOM children owned by an embed.
 *
 * @param {HTMLElement} element
 */
export function clearEmbedElement(element) {
    while (element.firstChild) {
        element.firstChild.remove();
    }
}
