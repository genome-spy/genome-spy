import latoRegularBitmap from "./fonts/Lato-Regular.webp";
import WebGLHelper, { readPickingPixel } from "./gl/webGLHelper.js";
import RenderCoordinator from "./renderCoordinator.js";
import { exportCanvas, exportRaster } from "./canvasExport.js";
import WebGLRendererResources from "./rendererResources.js";
import { rasterizeSvgRuns } from "./svgRasterizer.js";
import BmFontManager from "./fonts/bmFontManager.js";
import { createRasterCellResolver } from "../immediate/marks/raster.js";
import {
    pickingPixelCenter,
    RASTER_COORDINATE_OFFSET,
} from "../renderingConstants.js";

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
    const textMetrics = new BmFontManager(
        (bitmapUrl) => rendererResources.prepareFontBitmap(bitmapUrl),
        latoRegularBitmap
    );

    return {
        surface: glHelper,
        textMetrics,
        getMarkRenderingDebugState: (mark) =>
            rendererResources.getMarkRenderingDebugState(mark),
        createRenderCoordinator: (coordinatorOptions) =>
            new RenderCoordinator({
                ...coordinatorOptions,
                glHelper,
                markAdapter: rendererResources,
            }),
        exportCanvas: (exportOptions) =>
            exportCanvas({
                ...exportOptions,
                glHelper,
                markAdapter: rendererResources,
            }),
        exportRaster: (exportOptions) =>
            exportRaster({
                ...exportOptions,
                glHelper,
                markAdapter: rendererResources,
            }),
        rasterizeSvgRuns: (rasterOptions) =>
            rasterizeSvgRuns({
                ...rasterOptions,
                webGLHelper: glHelper,
                markAdapter: rendererResources,
            }),
        createCellIndexResolver: (layout) =>
            createRasterCellResolver(layout, (mark, x, y) => {
                const point = pickingPixelCenter(
                    x,
                    y,
                    glHelper.getDevicePixelRatio()
                );
                point.x -= RASTER_COORDINATE_OFFSET;
                // Adding the same offset to both matrix axes moves the midpoint only.
                if (!mark.isTriangle) point.y -= RASTER_COORDINATE_OFFSET;
                return point;
            }),
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
