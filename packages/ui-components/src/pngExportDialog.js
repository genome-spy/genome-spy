import { css, html, nothing } from "lit";
import {
    faDownload,
    faInfoCircle,
    faXmark,
} from "@fortawesome/free-solid-svg-icons";
import ImageExportDialog, { inputListener } from "./imageExportSupport.js";
import { renderIcon } from "./icon.js";

/**
 * PNG export settings with a scale slider, output dimensions, and background controls.
 *
 * @customElement gs-save-image-dialog
 * @extends {ImageExportDialog<import("./imageExportSupport.js").PngExportSource>}
 */
export default class PngExportDialog extends ImageExportDialog {
    static properties = {
        ...super.properties,
        _dimensions: { state: true },
        devicePixelRatio: { type: Number, attribute: "scale-factor" },
        backgroundMode: { type: String, attribute: "background-mode" },
        roundDimensions: { type: Boolean, attribute: "round-dimensions" },
        _showTips: { state: true },
        backgroundColor: { type: String, attribute: "background-color" },
    };

    static styles = [
        ...super.styles,
        css`
            .dismiss-tips {
                float: right;
                margin-inline-start: 0.5em;
                padding: 0.25em;
            }

            .background-controls {
                display: flex;
                align-items: center;
                gap: 0.75em;
            }
        `,
    ];

    constructor() {
        super();

        this.dialogTitle = "Save Visualization as PNG Image";

        /** Initial scale factor in physical pixels per logical pixel. */
        this.devicePixelRatio = 2;
        this._dimensions = { logicalWidth: 0, logicalHeight: 0 };

        /** @type {"color" | "transparent" | "visualization"} Initial background selection. */
        this.backgroundMode = "color";
        /** Custom background color when backgroundMode is "color". */
        this.backgroundColor = "#ffffff";
        /** Round logical dimensions to even numbers, as in GenomeSpy App. */
        this.roundDimensions = true;
        this.filename = "genomespy-visualization.png";
        this._showTips = true;
    }

    /** @param {import("./imageExportSupport.js").PngExportSource} source */
    onExportOpen(source) {
        const { width, height } = source.getLogicalCanvasSize();
        this._dimensions = {
            logicalWidth: this.roundDimensions ? roundToEven(width) : width,
            logicalHeight: this.roundDimensions ? roundToEven(height) : height,
        };
        this._showTips = true;
    }

    renderBody() {
        const { logicalWidth, logicalHeight } = this._dimensions;
        const imageWidth = Math.round(logicalWidth * this.devicePixelRatio);
        const imageHeight = Math.round(logicalHeight * this.devicePixelRatio);

        return html`
            ${this._showTips ? this.#renderTips() : nothing}
            ${this.renderExportError()}

            <div class="gs-form-group">
                <label for="canvasDimensions">Visualization dimensions</label>
                <input
                    type="text"
                    id="canvasDimensions"
                    .value=${`${Math.round(logicalWidth)} x ${Math.round(logicalHeight)}`}
                    disabled
                />
            </div>

            <div class="gs-form-group">
                <label for="pngDevicePixelRatio">Scale factor</label>
                <div style="display: flex">
                    <input
                        type="range"
                        id="pngDevicePixelRatio"
                        min="0.5"
                        max="4"
                        step="0.5"
                        .value=${"" + this.devicePixelRatio}
                        ?disabled=${this._saving}
                        @input=${inputListener((input) => {
                            this.devicePixelRatio = input.valueAsNumber;
                        })}
                    />
                    <span style="width: 2em; margin-left: 0.5em"
                        >${this.devicePixelRatio}</span
                    >
                </div>
            </div>

            <div class="gs-form-group">
                <label for="pngDimensions">Image dimensions</label>
                <input
                    type="text"
                    id="pngDimensions"
                    .value=${`${imageWidth} x ${imageHeight}`}
                    disabled
                />
            </div>

            <div class="gs-form-group">
                <label for="pngBackgroundMode">Background</label>
                <div class="background-controls">
                    <select
                        id="pngBackgroundMode"
                        .value=${this.backgroundMode}
                        ?disabled=${this._saving}
                        @change=${(/** @type {Event} */ event) => {
                            const select = /** @type {HTMLSelectElement} */ (
                                event.currentTarget
                            );
                            this.backgroundMode =
                                /** @type {typeof this.backgroundMode} */ (
                                    select.value
                                );
                        }}
                    >
                        <option value="visualization">
                            Use visualization background
                        </option>
                        <option value="color">Custom color</option>
                        <option value="transparent">Transparent</option>
                    </select>
                    ${
                        this.backgroundMode === "color"
                            ? html`<input
                                  type="color"
                                  aria-label="Custom background color"
                                  .value=${this.backgroundColor}
                                  ?disabled=${this._saving}
                                  @change=${inputListener((input) => {
                                      this.backgroundColor = input.value;
                                  })}
                              />`
                            : nothing
                    }
                </div>
            </div>
        `;
    }

    #renderTips() {
        return html`
            <div class="gs-alert info">
                ${renderIcon(faInfoCircle)}
                <div>
                    <button
                        class="btn dismiss-tips"
                        type="button"
                        aria-label="Dismiss export tips"
                        @click=${() => {
                            this._showTips = false;
                        }}
                    >
                        ${renderIcon(faXmark)}
                    </button>
                    To create publication-quality images:
                    <ol>
                        <li>
                            Adjust the visualization area so the visualization
                            and labels appear as you want them.
                        </li>
                        <li>
                            Use the scale factor slider below to increase
                            resolution.
                        </li>
                        <li>
                            Smaller image dimensions with a higher scale factor
                            will produce relatively larger and clearer labels
                            and elements.
                        </li>
                    </ol>
                </div>
            </div>
        `;
    }

    renderButtons() {
        return [
            this.makeCloseButton("Cancel"),
            this.makeButton("Save PNG", () => this.#downloadImage(), {
                iconDef: faDownload,
                isPrimary: true,
                disabled: this._saving,
            }),
        ];
    }

    #downloadImage() {
        return this.download((source) =>
            source.imageExport.raster({
                ...this._dimensions,
                pixelRatio: this.devicePixelRatio,
                ...(this.backgroundMode === "visualization"
                    ? {}
                    : {
                          background:
                              this.backgroundMode === "transparent"
                                  ? null
                                  : this.backgroundColor,
                      }),
                mimeType: "image/png",
            })
        );
    }
}

/** @param {number} num */
function roundToEven(num) {
    return Math.round(num / 2) * 2;
}
