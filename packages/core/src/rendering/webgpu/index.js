import latoRegularBitmap from "../../fonts/Lato-Regular.png";
import WebGpuRenderCoordinator from "./webGpuRenderCoordinator.js";
import WebGpuSurface from "./webGpuSurface.js";
import {
    exportCanvas,
    exportRaster,
    rasterizeSvgRuns,
} from "./webGpuRasterExport.js";

/**
 * Creates the experimental WebGPU backend used by the first-example vertical
 * slice. Unsupported capabilities intentionally fail instead of falling back
 * to another renderer.
 *
 * @param {import("../renderingBackend.js").RenderingBackendOptions} options
 * @returns {Promise<import("../renderingBackend.js").RenderingBackend>}
 */
export async function createWebGpuRenderingBackend(options) {
    const surface = new WebGpuSurface(options);
    try {
        await surface.initialize();
    } catch (error) {
        surface.finalize();
        throw error;
    }

    let exportQueue = Promise.resolve();
    let exportBusy = false;
    const serializeExport = (/** @type {() => Promise<any>} */ operation) => {
        const run = async () => {
            exportBusy = true;
            try {
                return await operation();
            } finally {
                exportBusy = false;
            }
        };
        const result = exportQueue.then(run, run);
        exportQueue = result.then(
            completeExportOperation,
            completeExportOperation
        );
        return result;
    };

    return {
        surface,
        glHelper: undefined,
        defaultFontBitmapUrl: latoRegularBitmap,
        createRenderCoordinator: (coordinatorOptions) =>
            new WebGpuRenderCoordinator({
                ...coordinatorOptions,
                surface,
            }),
        readPickingId: (x, y) => surface.pick(x, y),
        exportCanvas: (options) => {
            if (exportBusy) {
                throw new Error(
                    "Synchronous canvas export cannot overlap an asynchronous WebGPU export."
                );
            }
            return exportCanvas(surface, options);
        },
        exportRaster: (options) =>
            serializeExport(() => exportRaster(surface, options)),
        rasterizeSvgRuns: (options) =>
            serializeExport(() => rasterizeSvgRuns(surface, options)),
    };
}

/** @returns {void} */
function completeExportOperation() {}
