import WebGpuRenderCoordinator from "./webGpuRenderCoordinator.js";
import WebGpuSurface from "./webGpuSurface.js";

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

    const unsupportedExport = () => {
        throw new Error(
            "Raster export is not implemented by the experimental WebGPU renderer."
        );
    };

    return {
        surface,
        glHelper: undefined,
        createRenderCoordinator: (coordinatorOptions) =>
            new WebGpuRenderCoordinator({
                ...coordinatorOptions,
                surface,
            }),
        readPickingId: (x, y) => surface.pick(x, y),
        exportCanvas: unsupportedExport,
        exportRaster: unsupportedExport,
    };
}
