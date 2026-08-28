import Canvas2DRenderCoordinator from "./canvas2DRenderCoordinator.js";
import Canvas2DSurface from "./canvas2DSurface.js";
import { exportCanvas, exportRaster } from "./rasterExport.js";
import { createCanvas2DSvgRasterizer } from "./svgRasterizer.js";

/**
 * @param {import("../renderingBackend.js").RenderingBackendOptions} options
 * @returns {import("../renderingBackend.js").RenderingBackend}
 */
export function createCanvas2DRenderingBackend(options) {
    const surface = new Canvas2DSurface(options);
    return {
        surface,
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
        rasterizeSvgRuns: (rasterOptions) =>
            createCanvas2DSvgRasterizer()(rasterOptions),
        readPickingId: (x, y) => surface.readPickingId(x, y),
    };
}
