import { html } from "lit";
import { showDialog } from "@genome-spy/ui-components/dialog";
import "@genome-spy/ui-components/define/imageExportDialog";

const width = 600;
const height = 120;
const layers = [
    {
        viewTitle: "Read coverage",
        viewPath: "viewRoot/coverage",
        markType: "rect",
        instanceCount: 8_000,
    },
];

const bands = Array.from({ length: 75 }, (_, index) => ({
    x: index * 8,
    height: 20 + ((index * 19) % 48),
}));

/**
 * @param {number} pixelRatio
 * @param {string | null} background
 */
function drawDemo(pixelRatio, background) {
    const canvas = document.createElement("canvas");
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    const context = canvas.getContext("2d");
    context.scale(pixelRatio, pixelRatio);
    if (background !== null) {
        context.fillStyle = background;
        context.fillRect(0, 0, width, height);
    }
    context.fillStyle = "#52889c";
    for (const band of bands) {
        context.fillRect(band.x, height - band.height, 6, band.height);
    }
    return canvas;
}

/** @type {NonNullable<import("@genome-spy/ui-components/imageExportDialog").PngExportDialog["source"]> & NonNullable<import("@genome-spy/ui-components/imageExportDialog").SvgExportDialog["source"]>} */
const demoSource = {
    getLogicalCanvasSize: () => ({ width, height }),
    imageExport: {
        raster: async ({ pixelRatio, background = "#f5f6f7" }) => ({
            blob: await new Promise((resolve) =>
                drawDemo(pixelRatio, background).toBlob(resolve, "image/png")
            ),
        }),
        analyzeSvg: async () => ({ layers }),
        svg: async ({ rasterization }) => {
            const content =
                rasterization &&
                layers[0].instanceCount > rasterization.maxVectorInstances
                    ? `<image width="${width}" height="${height}" href="${drawDemo(rasterization.pixelRatio, null).toDataURL()}"/>`
                    : bands
                          .map(
                              (band) =>
                                  `<rect x="${band.x}" y="${height - band.height}" width="6" height="${band.height}" fill="#52889c"/>`
                          )
                          .join("");
            return {
                blob: new Blob(
                    [
                        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${content}</svg>`,
                    ],
                    { type: "image/svg+xml" }
                ),
                warnings: [],
            };
        },
    },
};

export default {
    title: "Components/Image Export Dialogs",
    component: "gs-save-image-dialog",
    subcomponents: { SVG: "gs-save-svg-dialog" },
    tags: ["autodocs"],
    parameters: {
        docs: {
            description: {
                component:
                    "Register the dialogs with `@genome-spy/ui-components/define/imageExportDialog`. " +
                    "Set `.source` to a GenomeSpy embed result or provide a size getter and the export callbacks for the chosen format. " +
                    "Use `showDialog(tag, configure, { mount })` for a single export or keep a dialog mounted with `openOnConnect = false` and call `show()` to retain settings. " +
                    "Both dialogs inherit the dialog and form theme from their mount.",
            },
        },
    },
};

/** @param {"gs-save-image-dialog" | "gs-save-svg-dialog"} tag */
function renderTrigger(tag) {
    return html`<button
        type="button"
        @click=${(/** @type {MouseEvent} */ event) => {
            const mount = /** @type {HTMLElement} */ (
                event.currentTarget
            ).closest(".gs-story");
            void showDialog(
                tag,
                (
                    /** @type {import("@genome-spy/ui-components/imageExportDialog").PngExportDialog | import("@genome-spy/ui-components/imageExportDialog").SvgExportDialog} */ dialog
                ) => {
                    dialog.source = demoSource;
                },
                { mount: /** @type {HTMLElement} */ (mount) }
            );
        }}
    >
        Save ${tag === "gs-save-image-dialog" ? "PNG" : "SVG"}
    </button>`;
}

export const PNG = { render: () => renderTrigger("gs-save-image-dialog") };
export const SVG = { render: () => renderTrigger("gs-save-svg-dialog") };
