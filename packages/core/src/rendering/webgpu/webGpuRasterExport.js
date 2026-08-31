import { createLayoutResult } from "../../view/layout/layoutResult.js";
import Rectangle from "../../view/layout/rectangle.js";
import { RasterizationUnavailableError } from "../rasterization.js";
import { getPhysicalCrop, setRasterImage } from "../svg/raster/rasterImage.js";
import { TRANSPARENT_GPU_COLOR, toGpuColor } from "./webGpuColor.js";

/**
 * @param {import("./webGpuSurface.js").default} surface
 * @param {import("../renderingBackend.js").RasterExportOptions} options
 */
export async function exportRaster(surface, options) {
    const mimeType = options.mimeType ?? "image/png";
    if (mimeType != "image/png") {
        throw new Error(`Unsupported raster export MIME type: ${mimeType}`);
    }

    const liveSize = surface.getLogicalCanvasSize();
    const logicalWidth = options.logicalWidth ?? liveSize.width;
    const logicalHeight = options.logicalHeight ?? liveSize.height;
    const pixelRatio = options.pixelRatio ?? surface.getDevicePixelRatio();
    const target = createExportTarget(
        surface,
        logicalWidth,
        logicalHeight,
        pixelRatio
    );
    try {
        const layoutResult = createExportLayout(
            options.viewRoot,
            logicalWidth,
            logicalHeight,
            pixelRatio
        );
        surface.renderLayoutToTarget(
            layoutResult,
            target,
            toGpuColor(options.clearColor)
        );
        await target.handle.onSubmittedWorkDone();
        return canvasToBlob(target.canvas, mimeType);
    } finally {
        target.handle.destroy();
    }
}

/**
 * @param {import("./webGpuSurface.js").default} surface
 * @param {import("../renderingBackend.js").SvgRunRasterizationOptions} options
 */
export async function rasterizeSvgRuns(surface, options) {
    const target = createExportTarget(
        surface,
        options.logicalWidth,
        options.logicalHeight,
        options.pixelRatio
    );
    try {
        const cropCanvas = document.createElement("canvas");
        const cropContext = cropCanvas.getContext("2d");
        if (!cropContext) {
            throw new RasterizationUnavailableError(
                "Unable to initialize a WebGPU SVG crop context."
            );
        }
        const layoutResult =
            options.layoutResult && options.pixelRatio == 1
                ? options.layoutResult
                : createExportLayout(
                      options.viewRoot,
                      options.logicalWidth,
                      options.logicalHeight,
                      options.pixelRatio
                  );

        for (const run of options.runs) {
            surface.renderLayoutToTarget(
                layoutResult,
                target,
                TRANSPARENT_GPU_COLOR,
                (mark) => run.marks.has(mark)
            );
            await target.handle.onSubmittedWorkDone();

            const crop = getPhysicalCrop(
                run.bounds,
                options.pixelRatio,
                target.canvas.width,
                target.canvas.height
            );
            cropCanvas.width = crop.width;
            cropCanvas.height = crop.height;
            cropContext.resetTransform();
            cropContext.clearRect(0, 0, crop.width, crop.height);
            cropContext.drawImage(
                target.canvas,
                crop.x,
                crop.y,
                crop.width,
                crop.height,
                0,
                0,
                crop.width,
                crop.height
            );
            setRasterImage(
                run,
                crop,
                options.pixelRatio,
                cropCanvas.toDataURL("image/png")
            );
        }
    } finally {
        target.handle.destroy();
    }
}

/**
 * @param {import("./webGpuSurface.js").default} surface
 * @param {number} width
 * @param {number} height
 * @param {number} pixelRatio
 */
function createExportTarget(surface, width, height, pixelRatio) {
    try {
        return surface.createExportTarget(width, height, pixelRatio);
    } catch (error) {
        throw new RasterizationUnavailableError(
            "Unable to initialize a detached WebGPU export target.",
            { cause: error }
        );
    }
}

/**
 * @param {import("../../view/view.js").default} viewRoot
 * @param {number} logicalWidth
 * @param {number} logicalHeight
 * @param {number} pixelRatio
 */
function createExportLayout(viewRoot, logicalWidth, logicalHeight, pixelRatio) {
    return createLayoutResult(
        viewRoot,
        Rectangle.create(0, 0, logicalWidth, logicalHeight),
        {
            devicePixelRatio: pixelRatio,
            renderingOptions: { firstFacet: true },
        }
    );
}

/** @param {HTMLCanvasElement} canvas @param {"image/png"} mimeType */
function canvasToBlob(canvas, mimeType) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error("WebGPU could not encode the raster export."));
            }
        }, mimeType);
    });
}
