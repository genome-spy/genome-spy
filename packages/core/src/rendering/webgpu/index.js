import WebGpuRenderCoordinator from "./webGpuRenderCoordinator.js";
import WebGpuSurface from "./webGpuSurface.js";
import { exportRaster, rasterizeSvgRuns } from "./webGpuRasterExport.js";
import { createOutlineFontPreparer } from "./webGpuFontCatalog.js";
import { createNativeTextMetricsProvider } from "../nativeTextMetrics.js";
import OutlineTextMetricsProvider from "./outlineTextMetrics.js";

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

    let exportQueue = Promise.resolve();
    const serializeExport = (/** @type {() => Promise<any>} */ operation) => {
        const result = exportQueue.then(operation);
        exportQueue = result.catch(/** @returns {void} */ () => {});
        return result;
    };

    const prepareOutlineFont = createOutlineFontPreparer(options.fontCatalog);
    /** @type {ReturnType<typeof createNativeTextMetricsProvider> | undefined} */
    let nativeTextMetrics;
    const getNativeTextMetrics = () => {
        nativeTextMetrics ??= createNativeTextMetricsProvider(
            options.container.ownerDocument
        );
        return nativeTextMetrics;
    };
    const provisionalTextMetrics = {
        /** @param {import("../../fonts/textMetrics.js").FontConfig} config */
        requestFont: (config) => getNativeTextMetrics().requestFont(config),
        waitUntilReady: () => getNativeTextMetrics().waitUntilReady(),
    };
    const textMetrics = new OutlineTextMetricsProvider(
        prepareOutlineFont,
        provisionalTextMetrics
    );

    return {
        surface,
        textMetrics,
        glHelper: undefined,
        createRenderCoordinator: (coordinatorOptions) =>
            new WebGpuRenderCoordinator({
                ...coordinatorOptions,
                surface,
            }),
        readPickingId: (x, y) => surface.pick(x, y),
        exportCanvas: () => {
            throw new Error(
                "Synchronous canvas export is unavailable with WebGPU. Use imageExport.raster() instead."
            );
        },
        exportRaster: (options) =>
            serializeExport(() => exportRaster(surface, options)),
        rasterizeSvgRuns: (options) =>
            serializeExport(() => rasterizeSvgRuns(surface, options)),
    };
}
