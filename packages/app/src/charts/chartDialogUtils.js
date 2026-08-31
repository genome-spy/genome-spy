import { embed } from "@genome-spy/core";

/**
 * @param {ShadowRoot | HTMLElement | DocumentFragment} renderRoot
 * @param {import("@genome-spy/core/types/embedApi.js").EmbedResult | null} api
 * @param {string} filename
 * @param {string} [selector]
 * @returns {Promise<void>}
 */
export async function downloadChartPng(
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

    const { blob } = await api.imageExport.raster({
        logicalWidth: container.clientWidth,
        logicalHeight: container.clientHeight,
        pixelRatio: 3,
        background: "white",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    try {
        link.click();
    } finally {
        link.remove();
        URL.revokeObjectURL(url);
    }
}

/**
 * @param {HTMLElement} container
 * @param {import("./sampleAttributePlotTypes.d.ts").SampleAttributePlot} plot
 * @returns {Promise<import("@genome-spy/core/types/embedApi.js").EmbedResult>}
 */
export async function embedRenderablePlot(container, plot) {
    const spec =
        plot.namedData.length > 0
            ? {
                  ...plot.spec,
                  datasets: {
                      ...plot.spec.datasets,
                      ...Object.fromEntries(
                          plot.namedData.map((data) => [data.name, data.rows])
                      ),
                  },
              }
            : plot.spec;

    return embed(container, spec);
}
