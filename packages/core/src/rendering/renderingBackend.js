import { warnOnce } from "../utils/warning.js";
import { renderingModules } from "./renderingModuleRegistry.js";

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
 * @property {string} [defaultFontBitmapUrl]
 * @property {(bitmapUrl: string) => Promise<void>} [prepareFontBitmap]
 * @property {(mark: import("../marks/mark.js").default) => import("../types/viewContext.js").MarkRenderingDebugState} [getMarkRenderingDebugState]
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
        if (!renderingModules.canvasBackend) {
            throw rendererNotRegisteredError("canvas");
        }
        return renderingModules.canvasBackend(options);
    } else if (options.renderer == "webgpu" && import.meta.env.DEV) {
        return createWebGpuBackend(options);
    } else if (options.renderer != "auto" && options.renderer != "webgl") {
        throw new Error("Unknown renderer: " + options.renderer);
    }

    const webGlFactory = renderingModules.webglBackend;
    const canvasFactory = renderingModules.canvasBackend;
    if (!webGlFactory) {
        if (options.renderer == "webgl") {
            throw rendererNotRegisteredError("webgl");
        } else if (canvasFactory) {
            return canvasFactory(options);
        }
        throw new Error(
            'No rendering backend is registered. Import "@genome-spy/core/rendering/webgl.js" or "@genome-spy/core/rendering/canvas.js" when using "@genome-spy/core/minimal".'
        );
    }

    try {
        return await webGlFactory(options);
    } catch (error) {
        if (options.renderer == "webgl") {
            throw error;
        } else if (!canvasFactory) {
            throw new Error(
                'WebGL2 initialization failed and the Canvas2D fallback is not registered. Import "@genome-spy/core/rendering/canvas.js" when using "@genome-spy/core/minimal".',
                { cause: error }
            );
        }

        const backend = await canvasFactory(options);
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
async function createWebGpuBackend(options) {
    const modulePath = "./webgpu/index.js";
    const { createWebGpuRenderingBackend } = await import(
        /* @vite-ignore */ modulePath
    );
    return createWebGpuRenderingBackend(options);
}

/** @param {"canvas" | "webgl"} renderer */
function rendererNotRegisteredError(renderer) {
    return new Error(
        `The "${renderer}" rendering backend is not registered. Import "@genome-spy/core/rendering/${renderer}.js" when using "@genome-spy/core/minimal".`
    );
}
