import { color as parseColor } from "d3-color";

import latoRegularBitmap from "../../fonts/Lato-Regular.png";
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
        exportCanvas: (exportOptions) =>
            captureExportCanvas(surface, exportOptions).toDataURL("image/png"),
        exportRaster: (exportOptions) =>
            canvasToBlob(captureExportCanvas(surface, exportOptions)),
    };
}

/**
 * Renders the current frame into the WebGPU canvas and returns a canvas at the
 * requested output size. WebGPU canvases support the same image capture APIs
 * as ordinary HTML canvases, so no GPU readback or format-specific encoder is
 * needed here.
 *
 * @param {WebGpuSurface} surface
 * @param {object} options
 * @param {number} [options.logicalWidth]
 * @param {number} [options.logicalHeight]
 * @param {number} [options.pixelRatio]
 * @param {number} [options.devicePixelRatio]
 * @param {string | null} [options.clearColor]
 * @returns {HTMLCanvasElement}
 */
function captureExportCanvas(surface, options) {
    surface.render(toGpuColor(options.clearColor));

    const liveSize = surface.getLogicalCanvasSize();
    const pixelRatio =
        options.pixelRatio ??
        options.devicePixelRatio ??
        surface.getDevicePixelRatio();
    const width = Math.floor(
        (options.logicalWidth ?? liveSize.width) * pixelRatio
    );
    const height = Math.floor(
        (options.logicalHeight ?? liveSize.height) * pixelRatio
    );

    if (width == surface.canvas.width && height == surface.canvas.height) {
        return surface.canvas;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error(
            "Unable to initialize the WebGPU raster export canvas."
        );
    }
    context.drawImage(surface.canvas, 0, 0, width, height);
    return canvas;
}

/**
 * @param {string | null | undefined} background
 * @returns {GPUColor}
 */
function toGpuColor(background) {
    if (background == null) {
        return { r: 0, g: 0, b: 0, a: 0 };
    }
    const parsed = parseColor(background);
    if (!parsed) {
        throw new Error(
            `Invalid WebGPU canvas background color: ${background}`
        );
    }
    const rgb = parsed.rgb();
    return {
        r: rgb.r / 255,
        g: rgb.g / 255,
        b: rgb.b / 255,
        a: rgb.opacity,
    };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Blob>}
 */
function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error("WebGPU could not encode the raster export."));
            }
        }, "image/png");
    });
}
