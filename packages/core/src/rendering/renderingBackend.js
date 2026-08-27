import { warnOnce } from "../utils/warning.js";
import { createWebGLRenderingBackend } from "./webgl/index.js";

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
 * @typedef {object} RasterExportOptions
 * @property {import("../view/view.js").default} viewRoot
 * @property {number} [logicalWidth]
 * @property {number} [logicalHeight]
 * @property {number} [pixelRatio]
 * @property {string | null} [clearColor]
 * @property {"image/png"} [mimeType]
 */

/**
 * @typedef {object} SvgRunRasterizationOptions
 * @property {import("./svg/svgViewRenderingContext.js").SvgRasterRun[]} runs
 * @property {import("../view/view.js").default} viewRoot
 * @property {import("../view/layout/layoutResult.js").default} [layoutResult]
 * @property {number} logicalWidth
 * @property {number} logicalHeight
 * @property {number} pixelRatio
 */

/**
 * @typedef {object} RenderingBackend
 * @property {RenderingSurface} surface
 * @property {undefined} [glHelper] Legacy field retained for the unchanged WebGPU adapter.
 * @property {import("../types/viewContext.js").RendererResources} [rendererResources]
 * @property {(options: {viewRoot: import("../view/view.js").default, getBackground: () => string, broadcast: (type: import("../genomeSpy.js").BroadcastEventType, payload?: any) => void, onLayoutComputed: () => void}) => RenderingCoordinator} createRenderCoordinator
 * @property {(x: number, y: number) => number | null | Promise<number | null>} [readPickingId]
 * @property {(options: RasterExportOptions & {devicePixelRatio?: number}) => string} exportCanvas
 * @property {(options: RasterExportOptions) => Promise<Blob>} [exportRaster]
 * @property {(options: SvgRunRasterizationOptions) => void | Promise<void>} [rasterizeSvgRuns]
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
    } else if (options.renderer == "webgpu" && import.meta.env.DEV) {
        return createWebGpuBackend(options);
    } else if (options.renderer != "auto" && options.renderer != "webgl") {
        throw new Error("Unknown renderer: " + options.renderer);
    }

    try {
        return await createWebGLBackend(options);
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
 * @returns {Promise<RenderingBackend>}
 */
async function createWebGLBackend(options) {
    return createWebGLRenderingBackend(options);
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
    const modulePath = "./webgpu/index.js";
    const { createWebGpuRenderingBackend } = await import(
        /* @vite-ignore */ modulePath
    );
    return createWebGpuRenderingBackend(options);
}
