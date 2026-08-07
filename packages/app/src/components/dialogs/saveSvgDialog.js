import { css, html } from "lit";
import { faDownload } from "@fortawesome/free-solid-svg-icons";

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
        rasterPixelRatio: { type: Number },
        saving: { type: Boolean },
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
        `,
    ];

    constructor() {
        super();

        /** @type {import("@genome-spy/core/genomeSpy.js").default} */
        this.genomeSpy = null;

        this.dialogTitle = "Save Visualization as SVG";
        this.logicalWidth = 0;
        this.logicalHeight = 0;
        this.rasterizeDenseMarks = false;
        this.maxVectorInstances = 10_000;
        this.rasterPixelRatio = 2;
        this.saving = false;
    }

    connectedCallback() {
        super.connectedCallback();

        const { width, height } = this.genomeSpy.getLogicalCanvasSize();
        this.logicalWidth = Math.round(width);
        this.logicalHeight = Math.round(height);
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

    renderBody() {
        return html`
            <p>
                Marks are exported as editable vectors by default. Dense marks
                can optionally be rasterized while axes, labels, and other
                vector content remain editable.
            </p>

            <div class="gs-form-group">
                <label for="svgDimensions">Visualization dimensions</label>
                <input
                    type="text"
                    id="svgDimensions"
                    .value=${`${this.logicalWidth} x ${this.logicalHeight}`}
                    disabled
                />
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
                        this.maxVectorInstances = input.valueAsNumber;
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
            </div>
        `;
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
