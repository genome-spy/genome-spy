import { button } from "./button.js";

/**
 * @template T
 * @typedef {object} ImageButtonOptions
 * @prop {string} [filename] Name without extension. Defaults to `"genomespy"`.
 * @prop {T} [exportOptions] Options forwarded to the image export API.
 */

/**
 * Creates a PNG download button.
 * @param {ImageButtonOptions<import("../types/embedApi.js").RasterExportOptions>} [options]
 * @returns {import("../controls.js").Control}
 */
export function pngButton(options = {}) {
    return imageButton("PNG", options.filename ?? "genomespy", (api) =>
        api.imageExport.raster(options.exportOptions)
    );
}

/**
 * Creates an SVG download button. Minimal embeds must register the SVG renderer.
 * @param {ImageButtonOptions<import("../types/embedApi.js").SvgExportOptions>} [options]
 * @returns {import("../controls.js").Control}
 */
export function svgButton(options = {}) {
    return imageButton("SVG", options.filename ?? "genomespy", (api) =>
        api.imageExport.svg(options.exportOptions)
    );
}

// Image exports share a lock per panel, without coupling the panel to image controls.
/** @type {WeakMap<import("../controls.js").ControlContext, Set<HTMLButtonElement>>} */
const exportButtons = new WeakMap();

/**
 * @param {string} format
 * @param {string} filename
 * @param {(api: import("../types/embedApi.js").EmbedResult) => Promise<{blob: Blob, warnings?: string[]}>} exportImage
 * @returns {import("../controls.js").Control}
 */
function imageButton(format, filename, exportImage) {
    return {
        mount(context) {
            if (!exportButtons.has(context)) {
                exportButtons.set(context, new Set());
            }
            const buttons = exportButtons.get(context);
            const mounted = button({
                label: format,
                title: "Download " + format,
                async onClick() {
                    buttons.forEach((button) => (button.disabled = true));
                    context.showStatus("Preparing " + format + "…");
                    try {
                        const result = await exportImage(context.api);
                        if (!context.signal.aborted) {
                            downloadBlob(
                                context.container.ownerDocument,
                                result.blob,
                                `${filename}.${format.toLowerCase()}`
                            );
                            context.showStatus(
                                result.warnings?.join("\n") ?? ""
                            );
                        }
                    } finally {
                        buttons.forEach((button) => (button.disabled = false));
                    }
                },
            }).mount(context);
            buttons.add(/** @type {HTMLButtonElement} */ (mounted.element));
            return {
                element: mounted.element,
                dispose() {
                    buttons.delete(
                        /** @type {HTMLButtonElement} */ (mounted.element)
                    );
                    mounted.dispose();
                },
            };
        },
    };
}

/**
 * @param {Document} doc
 * @param {Blob} blob
 * @param {string} filename
 */
function downloadBlob(doc, blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = doc.createElement("a");
    link.href = url;
    link.download = filename;
    doc.body.append(link);
    try {
        link.click();
    } finally {
        link.remove();
        // Keep the URL alive until the browser has started the download.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
