import { LitElement, css, html, nothing } from "lit";
import { playgroundComponentStyles } from "./componentStyles.js";

const numberFormat = new Intl.NumberFormat("en-US");

export default class ImageExportDialog extends LitElement {
    static properties = {
        api: { attribute: false },
        format: { state: true },
        pngPixelRatio: { state: true },
        rasterizeDenseMarks: { state: true },
        maxVectorInstances: { state: true },
        rasterPixelRatio: { state: true },
        analysis: { state: true },
        analysisError: { state: true },
        exportError: { state: true },
        analyzing: { state: true },
        saving: { state: true },
    };

    static styles = [
        playgroundComponentStyles,
        css`
            dialog {
                width: min(31rem, calc(100vw - 24px));
                max-height: calc(100dvh - 24px);
                padding: 0;
                overflow: hidden;
                border: 1px solid var(--playground-border);
                border-radius: var(--playground-radius);
                background: var(--playground-surface);
                color: inherit;
                box-shadow: var(--playground-shadow);
            }

            dialog::backdrop {
                background: var(--playground-backdrop);
            }

            form {
                display: flex;
                max-height: calc(100dvh - 26px);
                flex-direction: column;
            }

            header,
            main,
            footer {
                padding: 16px;
            }

            header {
                border-bottom: 1px solid var(--playground-divider);
            }

            main {
                display: grid;
                gap: 16px;
                overflow: auto;
            }

            fieldset {
                margin: 0;
                padding: 0;
                border: none;
            }

            legend,
            strong.heading {
                font-weight: 600;
            }

            p {
                margin: 0;
            }

            .format-options {
                display: flex;
                margin-top: 8px;
                gap: 16px;
            }

            label {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .number-field {
                justify-content: space-between;
            }

            input[type="number"] {
                width: 7rem;
            }

            .settings,
            .preview {
                display: grid;
                gap: var(--playground-spacing);
            }

            .preview ul {
                max-height: 9rem;
                margin: 0;
                padding-left: 20px;
                overflow: auto;
            }

            footer {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
                border-top: 1px solid var(--playground-divider);
                background: var(--playground-panel);
            }
        `,
    ];

    constructor() {
        super();

        /** @type {import("@genome-spy/core/types/embedApi.js").EmbedResult | undefined} */
        this.api = undefined;
        this.format = "svg";
        this.pngPixelRatio = 2;
        this.rasterizeDenseMarks = true;
        this.maxVectorInstances = 5000;
        this.rasterPixelRatio = 2;
        /** @type {import("@genome-spy/core/types/embedApi.js").SvgExportAnalysis | undefined} */
        this.analysis = undefined;
        this.analysisError = "";
        this.exportError = "";
        this.analyzing = false;
        this.saving = false;
    }

    async show() {
        await this.updateComplete;
        this.exportError = "";
        /** @type {HTMLDialogElement} */ (
            this.renderRoot.querySelector("dialog")
        ).showModal();
        await this.#analyzeSvg();
    }

    /** @returns {import("@genome-spy/core/types/embedApi.js").SvgExportOptions} */
    getSvgExportOptions() {
        return this.rasterizeDenseMarks
            ? {
                  rasterization: {
                      maxVectorInstances: this.maxVectorInstances,
                      pixelRatio: this.rasterPixelRatio,
                  },
              }
            : {};
    }

    getRasterizationTargets() {
        return this.rasterizeDenseMarks
            ? (this.analysis?.layers.filter(
                  (layer) => layer.instanceCount > this.maxVectorInstances
              ) ?? [])
            : [];
    }

    async #analyzeSvg() {
        const api = this.api;
        if (!api) {
            return;
        }

        this.analyzing = true;
        this.analysis = undefined;
        this.analysisError = "";
        try {
            const analysis = await api.imageExport.analyzeSvg();
            if (this.api == api) {
                this.analysis = analysis;
            }
        } catch (error) {
            if (this.api == api) {
                this.analysis = undefined;
                this.analysisError =
                    error instanceof Error ? error.message : String(error);
            }
        } finally {
            if (this.api == api) {
                this.analyzing = false;
            }
        }
    }

    async #exportImage() {
        const api = this.api;
        if (!api) {
            return;
        }

        this.saving = true;
        this.exportError = "";
        try {
            if (this.format == "png") {
                const { blob } = await api.imageExport.raster({
                    mimeType: "image/png",
                    pixelRatio: this.pngPixelRatio,
                });
                await downloadBlob(blob, "genomespy-visualization.png");
            } else {
                const { blob, warnings } = await api.imageExport.svg(
                    this.getSvgExportOptions()
                );
                warnings.forEach((warning) => console.warn(warning));
                await downloadBlob(blob, "genomespy-visualization.svg");
            }

            /** @type {HTMLDialogElement} */ (
                this.renderRoot.querySelector("dialog")
            ).close();
        } catch (error) {
            this.exportError =
                error instanceof Error ? error.message : String(error);
        } finally {
            this.saving = false;
        }
    }

    #renderRasterizationPreview() {
        if (!this.rasterizeDenseMarks) {
            return html`<p>All SVG layers will remain vector graphics.</p>`;
        } else if (this.analyzing) {
            return html`<p>Analyzing visible layers…</p>`;
        } else if (this.analysisError) {
            return html`<p class="error">
                Rasterization preview failed: ${this.analysisError}
            </p>`;
        } else if (!this.analysis) {
            return nothing;
        }

        const targets = this.getRasterizationTargets();
        if (targets.length == 0) {
            return html`<p>No layers exceed the current threshold.</p>`;
        }

        const instanceCount = targets.reduce(
            (sum, layer) => sum + layer.instanceCount,
            0
        );
        return html`
            <p>
                <strong>${targets.length}</strong>
                ${targets.length == 1 ? "layer" : "layers"} containing
                <strong>${numberFormat.format(instanceCount)}</strong> visible
                instances will be rasterized.
            </p>
            <ul>
                ${targets.map(
                    (layer) => html`
                        <li>
                            ${getLayerDisplayName(layer)} (${layer.markType},
                            ${numberFormat.format(layer.instanceCount)})
                        </li>
                    `
                )}
            </ul>
        `;
    }

    #renderSettings() {
        if (this.format == "png") {
            return html`
                <div class="settings notice">
                    ${renderNumberField(
                        "pngPixelRatio",
                        "Scale factor",
                        this.pngPixelRatio,
                        (value) => (this.pngPixelRatio = value)
                    )}
                </div>
            `;
        }

        return html`
            <div class="settings notice">
                <label>
                    <input
                        id="rasterizeDenseMarks"
                        type="checkbox"
                        .checked=${this.rasterizeDenseMarks}
                        @change=${(/** @type {Event} */ event) =>
                            (this.rasterizeDenseMarks =
                                getInput(event).checked)}
                    />
                    Rasterize dense layers
                </label>
                ${renderNumberField(
                    "maxVectorInstances",
                    "Instance threshold",
                    this.maxVectorInstances,
                    (value) => (this.maxVectorInstances = value),
                    { min: 1, max: undefined, step: 1 },
                    !this.rasterizeDenseMarks
                )}
                ${renderNumberField(
                    "rasterPixelRatio",
                    "Raster scale factor",
                    this.rasterPixelRatio,
                    (value) => (this.rasterPixelRatio = value),
                    undefined,
                    !this.rasterizeDenseMarks
                )}
            </div>
            <section class="preview notice">
                <strong class="heading">Rasterization preview</strong>
                ${this.#renderRasterizationPreview()}
            </section>
        `;
    }

    render() {
        return html`
            <dialog @cancel=${() => (this.exportError = "")}>
                <form
                    @submit=${(/** @type {SubmitEvent} */ event) => {
                        event.preventDefault();
                        void this.#exportImage();
                    }}
                >
                    <header><h2>Export image</h2></header>
                    <main>
                        <fieldset>
                            <legend>Format</legend>
                            <div class="format-options">
                                <label>
                                    <input
                                        type="radio"
                                        name="imageFormat"
                                        value="png"
                                        .checked=${this.format == "png"}
                                        @change=${() => (this.format = "png")}
                                    />
                                    PNG
                                </label>
                                <label>
                                    <input
                                        type="radio"
                                        name="imageFormat"
                                        value="svg"
                                        .checked=${this.format == "svg"}
                                        @change=${() => (this.format = "svg")}
                                    />
                                    SVG
                                </label>
                            </div>
                        </fieldset>
                        ${this.#renderSettings()}
                        ${
                            this.exportError
                                ? html`<p class="error">
                                      Export failed: ${this.exportError}
                                  </p>`
                                : nothing
                        }
                    </main>
                    <footer>
                        <button
                            type="button"
                            class="button"
                            @click=${() =>
                                /** @type {HTMLDialogElement} */ (
                                    this.renderRoot.querySelector("dialog")
                                ).close()}
                        >
                            Cancel
                        </button>
                        <button
                            class="button primary"
                            type="submit"
                            ?disabled=${this.saving}
                        >
                            ${this.saving ? "Exporting…" : "Export"}
                        </button>
                    </footer>
                </form>
            </dialog>
        `;
    }
}

customElements.define("gs-playground-image-export-dialog", ImageExportDialog);

/**
 * @param {import("@genome-spy/core/types/embedApi.js").SvgExportLayerInfo} layer
 */
function getLayerDisplayName(layer) {
    return layer.viewTitle || layer.viewPath.replace(/^viewRoot\//, "");
}

/**
 * @param {Blob} blob
 * @param {string} filename
 */
async function downloadBlob(blob, filename) {
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => resolve(String(reader.result)));
        reader.addEventListener("error", () => reject(reader.error));
        reader.readAsDataURL(blob);
    });
    const link = document.createElement("a");
    link.href = /** @type {string} */ (dataUrl);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

/**
 * @param {string} id
 * @param {string} label
 * @param {number} value
 * @param {(value: number) => void} onInput
 * @param {{min: number, max?: number, step: number}} [range]
 * @param {boolean} [disabled]
 */
function renderNumberField(
    id,
    label,
    value,
    onInput,
    range = { min: 0.5, max: 8, step: 0.5 },
    disabled = false
) {
    return html`
        <label class="number-field">
            <span>${label}</span>
            <input
                id=${id}
                type="number"
                class="field"
                min=${range.min}
                max=${range.max ?? nothing}
                step=${range.step}
                required
                ?disabled=${disabled}
                .value=${String(value)}
                @input=${(/** @type {InputEvent} */ event) =>
                    onInput(getInput(event).valueAsNumber)}
            />
        </label>
    `;
}

/** @param {Event} event */
function getInput(event) {
    return /** @type {HTMLInputElement} */ (event.target);
}
