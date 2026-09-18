import Canvas2DRenderCoordinator from "./canvas2DRenderCoordinator.js";
import Canvas2DSurface from "./canvas2DSurface.js";
import { exportCanvas, exportRaster } from "./rasterExport.js";
import { createCanvas2DSvgRasterizer } from "./svgRasterizer.js";
import { createNativeTextMetricsProvider } from "../nativeTextMetrics.js";

/**
 * @param {import("../renderingBackend.js").RenderingBackendOptions} options
 * @returns {import("../renderingBackend.js").RenderingBackend}
 */
export function createCanvas2DRenderingBackend(options) {
    const surface = new Canvas2DSurface(options);
    const nativeTextMetrics = createNativeTextMetricsProvider(
        options.container.ownerDocument
    );
    return {
        surface,
        textMetrics: nativeTextMetrics,
        createRenderCoordinator: (coordinatorOptions) =>
            new Canvas2DRenderCoordinator({
                ...coordinatorOptions,
                surface,
                context: surface.context,
                textMetrics: nativeTextMetrics,
            }),
        exportCanvas: (exportOptions) =>
            exportCanvas({
                ...exportOptions,
                liveSize: surface.getLogicalCanvasSize(),
                liveDevicePixelRatio: surface.getDevicePixelRatio(),
                textMetrics: nativeTextMetrics,
            }),
        exportRaster: (exportOptions) =>
            exportRaster({
                ...exportOptions,
                liveSize: surface.getLogicalCanvasSize(),
                liveDevicePixelRatio: surface.getDevicePixelRatio(),
                textMetrics: nativeTextMetrics,
            }),
        rasterizeSvgRuns: (rasterOptions) =>
            createCanvas2DSvgRasterizer(nativeTextMetrics)(rasterOptions),
        readPickingId: (x, y) => surface.readPickingId(x, y),
    };
}
