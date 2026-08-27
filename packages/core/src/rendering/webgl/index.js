import WebGLHelper, { readPickingPixel } from "./gl/webGLHelper.js";
import RenderCoordinator from "./renderCoordinator.js";
import { exportCanvas, exportRaster } from "./canvasExport.js";
import WebGLRendererResources from "./rendererResources.js";
import { rasterizeSvgRuns } from "./svgRasterizer.js";

/**
 * @param {import("../renderingBackend.js").RenderingBackendOptions} options
 * @returns {import("../renderingBackend.js").RenderingBackend}
 */
export function createWebGLRenderingBackend(options) {
    const glHelper = new WebGLHelper(
        options.container,
        options.sizeSource,
        { powerPreference: options.powerPreference },
        options.onCanvasResize
    );
    const rendererResources = new WebGLRendererResources(glHelper);

    return {
        surface: glHelper,
        rendererResources,
        createRenderCoordinator: (coordinatorOptions) =>
            new RenderCoordinator({
                ...coordinatorOptions,
                glHelper,
            }),
        exportCanvas: (exportOptions) =>
            exportCanvas({ ...exportOptions, glHelper }),
        exportRaster: (exportOptions) =>
            exportRaster({ ...exportOptions, glHelper }),
        rasterizeSvgRuns: (rasterOptions) =>
            rasterizeSvgRuns({ ...rasterOptions, webGLHelper: glHelper }),
        readPickingId: (x, y) => {
            const dpr = glHelper.getDevicePixelRatio();
            const pixel = readPickingPixel(
                glHelper.gl,
                glHelper._pickingBufferInfo,
                x * dpr,
                y * dpr
            );
            return (
                pixel[0] | (pixel[1] << 8) | (pixel[2] << 16) | (pixel[3] << 24)
            );
        },
    };
}
