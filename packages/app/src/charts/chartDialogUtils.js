/**
 * @param {ShadowRoot | HTMLElement | DocumentFragment} renderRoot
 * @param {import("@genome-spy/core/types/embedApi.js").EmbedResult | null} api
 * @param {string} filename
 * @param {string} [selector]
 */
export function downloadChartPng(
    renderRoot,
    api,
    filename,
    selector = ".chart-container"
) {
    if (!api) {
        throw new Error("Chart is not ready for export.");
    }

    const container = /** @type {HTMLElement} */ (
        renderRoot.querySelector(selector)
    );
    if (!container) {
        throw new Error("Cannot find chart container.");
    }

    const dataUrl = api.exportCanvas(
        container.clientWidth,
        container.clientHeight,
        3,
        "white"
    );
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
