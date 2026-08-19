import renderCanvas2D from "./renderCanvas2D.js";

/**
 * @typedef {object} Canvas2DExportOptions
 * @property {import("../../view/view.js").default} viewRoot
 * @property {{width: number, height: number}} liveSize
 * @property {number} liveDevicePixelRatio
 * @property {number} [logicalWidth]
 * @property {number} [logicalHeight]
 * @property {number} [pixelRatio]
 * @property {string | null} [clearColor]
 * @property {"image/png"} [mimeType]
 */

/**
 * @param {Canvas2DExportOptions} options
 * @returns {Promise<Blob>}
 */
export async function exportRaster(options) {
    const mimeType = options.mimeType ?? "image/png";
    if (mimeType != "image/png") {
        throw new Error(`Unsupported raster export MIME type: ${mimeType}`);
    }

    const canvas = renderToCanvas(options);
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(
                    new Error("Canvas2D could not encode the raster export.")
                );
            }
        }, mimeType);
    });
}

/**
 * @param {Canvas2DExportOptions & {devicePixelRatio?: number}} options
 * @returns {string}
 */
export function exportCanvas(options) {
    return renderToCanvas({
        ...options,
        pixelRatio: options.devicePixelRatio ?? options.pixelRatio,
    }).toDataURL("image/png");
}

/**
 * @param {Canvas2DExportOptions} options
 * @returns {HTMLCanvasElement}
 */
function renderToCanvas(options) {
    const logicalWidth = options.logicalWidth ?? options.liveSize.width;
    const logicalHeight = options.logicalHeight ?? options.liveSize.height;
    const pixelRatio = options.pixelRatio ?? options.liveDevicePixelRatio;
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(logicalWidth * pixelRatio);
    canvas.height = Math.floor(logicalHeight * pixelRatio);
    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("Unable to initialize a Canvas2D export context.");
    }

    renderCanvas2D({
        viewRoot: options.viewRoot,
        context,
        width: logicalWidth,
        height: logicalHeight,
        devicePixelRatio: pixelRatio,
        background: options.clearColor ?? null,
        paint: true,
    });
    return canvas;
}
