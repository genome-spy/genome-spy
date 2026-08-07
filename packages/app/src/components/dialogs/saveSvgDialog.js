import { css, html } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faDownload, faInfoCircle } from "@fortawesome/free-solid-svg-icons";

import BaseDialog from "../generic/baseDialog.js";
import { showMessageDialog } from "../generic/messageDialog.js";
import { createInputListener } from "./saveImageDialog.js";

export default class SaveSvgDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        genomeSpy: { type: Object },
        logicalWidth: { type: Number },
        logicalHeight: { type: Number },
        rasterizeDenseMarks: { type: Boolean },
        maxVectorInstances: { type: Number },
        previewMaxVectorInstances: { state: true },
        rasterPixelRatio: { type: Number },
        saving: { type: Boolean },
        analyzing: { type: Boolean },
        analysisError: { type: String },
        layers: { attribute: false },
    };

    static styles = [
        ...super.styles,
        css`
            dialog {
                min-width: 500px;
            }

            .checkbox-row {
                display: flex;
                align-items: center;
                gap: 0.4em;
            }

            .raster-preview {
                max-height: 12em;
                overflow-y: auto;
                padding: 0.6em 0.75em;
                border: var(--form-control-border);
                border-radius: var(--form-control-border-radius);
                background: #f8f8f8;
            }

            .raster-preview ul {
                margin: 0.5em 0 0;
                padding: 0;
                list-style: none;
            }

            .raster-preview li {
                display: flex;
                justify-content: space-between;
                gap: 1em;
            }

            .raster-preview li + li {
                margin-top: 0.25em;
            }

            .layer-name {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .layer-details {
                flex: none;
                color: #606060;
                font-variant-numeric: tabular-nums;
            }
        `,
    ];

    constructor() {
        super();

        /** @type {import("@genome-spy/core/genomeSpy.js").default} */
        this.genomeSpy = null;

        this.dialogTitle = "Save Visualization as SVG";
        this.logicalWidth = 0;
        this.logicalHeight = 0;
        this.rasterizeDenseMarks = true;
        this.maxVectorInstances = 5_000;
        this.previewMaxVectorInstances = 5_000;
        this.rasterPixelRatio = 2;
        this.saving = false;
        this.analyzing = false;
        this.analysisError = "";

        /** @type {import("@genome-spy/core/types/embedApi.js").SvgExportLayerInfo[]} */
        this.layers = [];
    }

    /** @type {number | undefined} */
    #previewThresholdTimeout;

    /** @type {number | undefined} */
    #resizeAnalysisTimeout;

    /** @type {ResizeObserver | undefined} */
    #resizeObserver;

    connectedCallback() {
        super.connectedCallback();

        this.#updateCanvasSize();
        void this.#analyzeLayers();

        if (typeof ResizeObserver === "function") {
            this.#resizeObserver = new ResizeObserver(() => {
                if (this.#updateCanvasSize()) {
                    this.#scheduleLayerAnalysis();
                }
            });
            this.#resizeObserver.observe(this.genomeSpy.container);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();

        this.#resizeObserver?.disconnect();
        this.#resizeObserver = undefined;

        if (this.#previewThresholdTimeout !== undefined) {
            window.clearTimeout(this.#previewThresholdTimeout);
            this.#previewThresholdTimeout = undefined;
        }
        if (this.#resizeAnalysisTimeout !== undefined) {
            window.clearTimeout(this.#resizeAnalysisTimeout);
            this.#resizeAnalysisTimeout = undefined;
        }
    }

    /** @returns {boolean} Whether the dimensions changed. */
    #updateCanvasSize() {
        const { width, height } = this.genomeSpy.getLogicalCanvasSize();
        const logicalWidth = Math.round(width);
        const logicalHeight = Math.round(height);
        const changed =
            logicalWidth != this.logicalWidth ||
            logicalHeight != this.logicalHeight;

        this.logicalWidth = logicalWidth;
        this.logicalHeight = logicalHeight;
        return changed;
    }

    #scheduleLayerAnalysis() {
        if (this.#resizeAnalysisTimeout !== undefined) {
            window.clearTimeout(this.#resizeAnalysisTimeout);
        }
        this.#resizeAnalysisTimeout = window.setTimeout(() => {
            this.#resizeAnalysisTimeout = undefined;
            void this.#analyzeLayers();
        }, 500);
    }

    /** @returns {import("@genome-spy/core/types/embedApi.js").SvgExportOptions} */
    getExportOptions() {
        return this.rasterizeDenseMarks
            ? {
                  rasterization: {
                      maxVectorInstances: this.maxVectorInstances,
                      pixelRatio: this.rasterPixelRatio,
                  },
              }
            : {};
    }

    /** @returns {import("@genome-spy/core/types/embedApi.js").SvgExportLayerInfo[]} */
    getRasterizedLayers() {
        return this.rasterizeDenseMarks &&
            Number.isFinite(this.previewMaxVectorInstances)
            ? this.layers.filter(
                  (layer) =>
                      layer.instanceCount > this.previewMaxVectorInstances
              )
            : [];
    }

    renderBody() {
        return html`
            <div class="gs-alert info">
                ${icon(faInfoCircle).node[0]}
                <span>
                    SVG export keeps the image as editable vector graphics.
                    Dense layers can be embedded as raster images to keep the
                    file smaller and faster to load.
                </span>
            </div>

            <div class="gs-form-group">
                <label for="svgDimensions">Visualization dimensions</label>
                <input
                    type="text"
                    id="svgDimensions"
                    .value=${`${this.logicalWidth} x ${this.logicalHeight}`}
                    disabled
                />
                <small
                    >Dimensions are based on the current canvas size. Resize the
                    window to change them.</small
                >
            </div>

            <div class="gs-form-group">
                <label class="checkbox-row">
                    <input
                        type="checkbox"
                        id="svgRasterizeDenseMarks"
                        ?checked=${this.rasterizeDenseMarks}
                        ?disabled=${this.saving}
                        @change=${createInputListener((input) => {
                            this.rasterizeDenseMarks = input.checked;
                        })}
                    />
                    Rasterize dense marks
                </label>
                <small>
                    Adjacent dense layers are combined into the same embedded
                    image when possible.
                </small>
            </div>

            <div class="gs-form-group">
                <label for="svgMaxVectorInstances"
                    >Maximum vector instances per mark</label
                >
                <input
                    type="number"
                    id="svgMaxVectorInstances"
                    min="1"
                    step="1000"
                    .value=${"" + this.maxVectorInstances}
                    ?disabled=${!this.rasterizeDenseMarks || this.saving}
                    @input=${createInputListener((input) => {
                        this.#setMaxVectorInstances(input.valueAsNumber);
                    })}
                />
                <small>
                    A mark is rasterized when its visible instance count exceeds
                    this threshold.
                </small>
            </div>

            <div class="gs-form-group">
                <label for="svgRasterPixelRatio">Raster scale factor</label>
                <div style="display: flex">
                    <input
                        type="range"
                        id="svgRasterPixelRatio"
                        min="0.5"
                        max="4"
                        step="0.5"
                        .value=${"" + this.rasterPixelRatio}
                        ?disabled=${!this.rasterizeDenseMarks || this.saving}
                        @input=${createInputListener((input) => {
                            this.rasterPixelRatio = input.valueAsNumber;
                        })}
                    />
                    <span style="width: 2em; margin-left: 0.5em"
                        >${this.rasterPixelRatio}</span
                    >
                </div>
                <small>
                    Controls the resolution of embedded raster layers. Higher
                    values produce sharper images but increase file size. Vector
                    elements are unaffected.
                </small>
            </div>

            <div class="gs-form-group">
                <div class="label">Rasterization preview</div>
                ${this.#renderRasterizationPreview()}
            </div>
        `;
    }

    /** @param {number} value */
    #setMaxVectorInstances(value) {
        this.maxVectorInstances = value;

        if (this.#previewThresholdTimeout !== undefined) {
            window.clearTimeout(this.#previewThresholdTimeout);
        }
        this.#previewThresholdTimeout = window.setTimeout(() => {
            this.previewMaxVectorInstances = value;
            this.#previewThresholdTimeout = undefined;
        }, 500);
    }

    #renderRasterizationPreview() {
        if (!this.rasterizeDenseMarks) {
            return html`<div class="raster-preview">
                All layers will remain vector.
            </div>`;
        } else if (this.analyzing) {
            return html`<div class="raster-preview">
                Analyzing visible layers…
            </div>`;
        } else if (this.analysisError) {
            return html`<div class="raster-preview">
                Layer analysis failed: ${this.analysisError}
            </div>`;
        }

        const layers = this.getRasterizedLayers();
        if (!layers.length) {
            return html`<div class="raster-preview">
                No visible layers exceed the threshold.
            </div>`;
        }

        return html`
            <div class="raster-preview">
                <div>
                    ${layers.length} ${layers.length == 1 ? "layer" : "layers"}
                    will be rasterized:
                </div>
                <ul>
                    ${layers.map(
                        (layer) => html`
                            <li title=${layer.viewPath}>
                                <span class="layer-name"
                                    >${getLayerDisplayName(layer)}</span
                                >
                                <span class="layer-details"
                                    >${layer.markType} ·
                                    ${layer.instanceCount.toLocaleString()}
                                    instances</span
                                >
                            </li>
                        `
                    )}
                </ul>
            </div>
        `;
    }

    async #analyzeLayers() {
        this.analyzing = true;
        this.analysisError = "";
        try {
            const analysis = await this.genomeSpy.analyzeSvgExport({
                logicalWidth: this.logicalWidth,
                logicalHeight: this.logicalHeight,
            });
            this.layers = analysis.layers;
        } catch (error) {
            this.analysisError =
                error instanceof Error ? error.message : String(error);
        } finally {
            this.analyzing = false;
        }
    }

    renderButtons() {
        const invalidThreshold =
            !Number.isInteger(this.maxVectorInstances) ||
            this.maxVectorInstances < 1;
        return [
            this.makeCloseButton("Cancel"),
            this.makeButton("Save SVG", () => this.#downloadSvg(), {
                iconDef: faDownload,
                isPrimary: true,
                disabled:
                    this.saving ||
                    (this.rasterizeDenseMarks && invalidThreshold),
            }),
        ];
    }

    /** @returns {Promise<boolean>} */
    async #downloadSvg() {
        this.saving = true;
        try {
            const pickerWindow = /** @type {Window & {
                showSaveFilePicker?: (options: object) => Promise<{
                    createWritable: () => Promise<{
                        write: (data: Blob) => Promise<void>,
                        close: () => Promise<void>
                    }>
                }>
            }} */ (window);
            const fileHandle = pickerWindow.showSaveFilePicker
                ? await pickerWindow.showSaveFilePicker({
                      suggestedName: "genomespy-visualization.svg",
                      types: [
                          {
                              description: "SVG image",
                              accept: { "image/svg+xml": [".svg"] },
                          },
                      ],
                  })
                : undefined;

            const { blob, warnings, rasterized } =
                await this.genomeSpy.exportSvg(this.getExportOptions());
            warnings.forEach((warning) => console.warn(warning));

            if (fileHandle) {
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
            } else {
                const link = document.createElement("a");
                link.href =
                    "data:image/svg+xml;charset=utf-8," +
                    encodeURIComponent(await blob.text());
                link.download = "genomespy-visualization.svg";
                document.body.appendChild(link);
                link.click();
                link.remove();
            }

            this.finish({ ok: true, data: { warnings, rasterized } });
            return false;
        } catch (error) {
            if (error instanceof DOMException && error.name == "AbortError") {
                return true;
            }
            await showMessageDialog(
                `SVG export failed: ${
                    error instanceof Error ? error.message : String(error)
                }`,
                { title: "SVG export", type: "error" }
            );
            return true;
        } finally {
            this.saving = false;
        }
    }
}

customElements.define("gs-save-svg-dialog", SaveSvgDialog);

/**
 * @param {import("@genome-spy/core/types/embedApi.js").SvgExportLayerInfo} layer
 */
function getLayerDisplayName(layer) {
    return layer.viewTitle || layer.viewPath.replace(/^viewRoot\//, "");
}
