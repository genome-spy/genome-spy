/**
 * Signals that a raster backend could not be initialized or does not support
 * the requested operation. Rendering errors must use their original type so
 * that they are not hidden by a fallback.
 */
export class RasterizationUnavailableError extends Error {
    /** @param {string} message @param {{cause?: unknown}} [options] */
    constructor(message, options) {
        super(message, options);
        this.name = "RasterizationUnavailableError";
    }
}

/**
 * Uses the selected backend's raster export when available, otherwise tries a
 * detached Canvas2D renderer. An unselected GPU renderer is never initialized.
 *
 * @param {import("./renderingBackend.js").RenderingBackend} backend
 * @param {import("./renderingBackend.js").RasterExportOptions} options
 * @returns {Promise<Blob>}
 */
export async function exportRasterUsingBackend(backend, options) {
    if (backend.exportRaster) {
        try {
            return await backend.exportRaster(options);
        } catch (error) {
            if (!(error instanceof RasterizationUnavailableError)) {
                throw error;
            }
        }
    }

    let canvasModule;
    try {
        canvasModule = await import("./canvas2d/rasterExport.js");
    } catch (error) {
        throw unavailableRasterExportError(error);
    }

    try {
        return await canvasModule.exportRaster({
            ...options,
            liveSize: backend.surface.getLogicalCanvasSize(),
            liveDevicePixelRatio: backend.surface.getDevicePixelRatio(),
        });
    } catch (error) {
        if (error instanceof RasterizationUnavailableError) {
            throw unavailableRasterExportError(error);
        }
        throw error;
    }
}

/**
 * Uses the selected backend's selective rasterizer when available, otherwise
 * tries a detached Canvas2D renderer.
 *
 * @param {import("./renderingBackend.js").RenderingBackend} backend
 * @param {import("./renderingBackend.js").SvgRunRasterizationOptions} options
 */
export async function rasterizeSvgRunsUsingBackend(backend, options) {
    if (backend.rasterizeSvgRuns) {
        try {
            await backend.rasterizeSvgRuns(options);
            return;
        } catch (error) {
            if (!(error instanceof RasterizationUnavailableError)) {
                throw error;
            }
        }
    }

    let canvasModule;
    try {
        canvasModule = await import("./canvas2d/svgRasterizer.js");
    } catch (error) {
        throw new RasterizationUnavailableError(
            "No raster backend supports selective SVG rasterization.",
            { cause: error }
        );
    }

    const rasterizeSvgRuns = canvasModule.createCanvas2DSvgRasterizer();
    await rasterizeSvgRuns(options);
}

/** @param {unknown} cause */
function unavailableRasterExportError(cause) {
    return new RasterizationUnavailableError(
        "Raster export is unsupported because no raster rendering backend is available.",
        { cause }
    );
}
