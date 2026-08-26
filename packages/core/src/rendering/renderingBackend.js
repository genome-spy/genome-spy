import WebGLHelper, { readPickingPixel } from "../gl/webGLHelper.js";
import RenderCoordinator from "../genomeSpy/renderCoordinator.js";
import { warnOnce } from "../utils/warning.js";
import { exportCanvas, exportRaster } from "../genomeSpy/canvasExport.js";

/**
 * @typedef {object} RenderingSurface
 * @property {HTMLCanvasElement} canvas
 * @property {() => boolean} invalidateSize
 * @property {() => { width: number, height: number }} getLogicalCanvasSize
 * @property {() => number} getDevicePixelRatio
 * @property {() => void} finalize
 */

/**
 * @typedef {object} RenderingCoordinator
 * @property {() => void} computeLayout
 * @property {() => void} renderAll
 * @property {() => void} [renderPickingFramebuffer]
 */

/**
 * @typedef {object} RenderingBackend
 * @property {RenderingSurface} surface
 * @property {WebGLHelper | undefined} glHelper
 * @property {(options: Omit<ConstructorParameters<typeof RenderCoordinator>[0], "glHelper">) => RenderingCoordinator} createRenderCoordinator
 * @property {(x: number, y: number) => number | null | Promise<number | null>} [readPickingId]
 * @property {(options: Omit<Parameters<typeof exportCanvas>[0], "glHelper">) => string} exportCanvas
 * @property {(options: Omit<Parameters<typeof exportRaster>[0], "glHelper">) => Promise<Blob>} exportRaster
 */

/**
 * @typedef {object} RenderingBackendOptions
 * @property {"auto" | "webgl" | "canvas" | "webgpu"} renderer
 * @property {HTMLElement} container
 * @property {() => { width: number | undefined, height: number | undefined }} sizeSource
 * @property {WebGLPowerPreference} powerPreference
 * @property {() => void} onCanvasResize
 * @property {() => void} [onRenderInvalidated]
 * @property {(error: Error) => void} [onError]
 */

/**
 * @param {RenderingBackendOptions} options
 * @returns {Promise<RenderingBackend>}
 */
export async function createRenderingBackend(options) {
    if (options.renderer == "canvas") {
        return createCanvas2DBackend(options);
    } else if (options.renderer == "webgpu" && import.meta.env?.DEV) {
        return createWebGpuBackend(options);
    } else if (options.renderer != "auto" && options.renderer != "webgl") {
        throw new Error("Unknown renderer: " + options.renderer);
    }

    try {
        return createWebGLBackend(options);
    } catch (error) {
        if (options.renderer == "webgl") {
            throw error;
        }

        const backend = await createCanvas2DBackend(options);
        warnOnce(
            "WebGL2 is unavailable. Using the Canvas2D compatibility renderer."
        );
        return backend;
    }
}

/**
 * @param {RenderingBackendOptions} options
 * @returns {RenderingBackend}
 */
function createWebGLBackend(options) {
    const glHelper = new WebGLHelper(
        options.container,
        options.sizeSource,
        { powerPreference: options.powerPreference },
        options.onCanvasResize
    );

    return {
        surface: glHelper,
        glHelper,
        createRenderCoordinator: (coordinatorOptions) =>
            new RenderCoordinator({
                ...coordinatorOptions,
                glHelper,
            }),
        exportCanvas: (exportOptions) =>
            exportCanvas({ ...exportOptions, glHelper }),
        exportRaster: (exportOptions) =>
            exportRaster({ ...exportOptions, glHelper }),
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

/**
 * @param {RenderingBackendOptions} options
 * @returns {Promise<RenderingBackend>}
 */
async function createCanvas2DBackend(options) {
    const { createCanvas2DRenderingBackend } =
        await import("./canvas2d/index.js");
    return createCanvas2DRenderingBackend(options);
}

/**
 * @param {RenderingBackendOptions} options
 * @returns {Promise<RenderingBackend>}
 */
async function createWebGpuBackend(options) {
    const { createWebGpuRenderingBackend } = await import("./webgpu/index.js");
    return createWebGpuRenderingBackend(options);
}
