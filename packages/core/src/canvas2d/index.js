import Canvas2DRenderCoordinator from "./canvas2DRenderCoordinator.js";
import Canvas2DSurface from "./canvas2DSurface.js";
import { exportCanvas, exportRaster } from "./rasterExport.js";

/**
 * @param {import("../genomeSpy/renderingBackend.js").RenderingBackendOptions} options
 * @returns {import("../genomeSpy/renderingBackend.js").RenderingBackend}
 */
export function createCanvas2DRenderingBackend(options) {
    const surface = new Canvas2DSurface(options);
    return {
        surface,
        glHelper: undefined,
        createRenderCoordinator: (coordinatorOptions) =>
            new Canvas2DRenderCoordinator({
                ...coordinatorOptions,
                surface,
                context: surface.context,
            }),
        exportCanvas: (exportOptions) =>
            exportCanvas({
                ...exportOptions,
                liveSize: surface.getLogicalCanvasSize(),
                liveDevicePixelRatio: surface.getDevicePixelRatio(),
            }),
        exportRaster: (exportOptions) =>
            exportRaster({
                ...exportOptions,
                liveSize: surface.getLogicalCanvasSize(),
                liveDevicePixelRatio: surface.getDevicePixelRatio(),
            }),
    };
}
