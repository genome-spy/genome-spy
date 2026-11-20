import { css, html } from "lit";
import { faDownload, faInfoCircle } from "@fortawesome/free-solid-svg-icons";

import ImageExportDialog, { inputListener } from "./imageExportSupport.js";
import { renderIcon } from "./icon.js";

/**
 * SVG export settings with controls for rasterizing dense marks and a live preview of affected layers.
 *
 * @customElement gs-save-svg-dialog
 * @extends {ImageExportDialog<import("./imageExportSupport.js").SvgExportSource>}
 */
export default class SvgExportDialog extends ImageExportDialog {
    static properties = {
        ...super.properties,
        resizeTarget: { attribute: false },
        _dimensions: { state: true },
        rasterizeDenseMarks: {
            type: Boolean,
            attribute: "rasterize-dense-marks",
        },
        maxVectorInstances: { type: Number, attribute: "max-vector-instances" },
        _previewMaxVectorInstances: { state: true },
        rasterPixelRatio: { type: Number, attribute: "raster-scale-factor" },
        _analyzing: { state: true },
        _analysisError: { state: true },
        _layers: { state: true },
    };

    static styles = [
        ...super.styles,
        css`
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
                background: var(--gs-control-background, #f8f8f8);
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
                color: var(--gs-muted-text, #606060);
                font-variant-numeric: tabular-nums;
            }
        `,
    ];

    constructor() {
        super();

        /** @type {Element | undefined} Optional element to observe for changes to canvas dimensions. */
        this.resizeTarget = undefined;

        this.dialogTitle = "Save Visualization as SVG";
        this._dimensions = { logicalWidth: 0, logicalHeight: 0 };

        /** Allow dense layers to be embedded as raster images. */
        this.rasterizeDenseMarks = true;

        /** Rasterize visible mark layers with more instances than this threshold. */
        this.maxVectorInstances = 5_000;
        this._previewMaxVectorInstances = this.maxVectorInstances;

        /** Physical pixels per logical pixel in embedded raster layers. */
        this.rasterPixelRatio = 2;
        this.filename = "genomespy-visualization.svg";
        this._analyzing = false;
        this._analysisError = "";

        /** @type {import("./imageExportSupport.js").SvgExportLayer[]} */
        this._layers = [];
    }

    /** @type {number | undefined} */
    #previewThresholdTimeout;

    /** @type {number | undefined} */
    #resizeAnalysisTimeout;

    /** @type {ResizeObserver | undefined} */
    #resizeObserver;

    #analysisRequest = 0;

    onExportOpen() {
        this._previewMaxVectorInstances = this.maxVectorInstances;
        this._layers = [];
        this.#updateCanvasSize();
        void this.#analyzeLayers();

        if (this.resizeTarget && typeof ResizeObserver === "function") {
            this.#resizeObserver = new ResizeObserver(() => {
                if (
                    this.isCurrentSession(this.session) &&
                    this.#updateCanvasSize()
                ) {
                    this.#scheduleLayerAnalysis();
                }
            });
            this.#resizeObserver.observe(this.resizeTarget);
        }
    }

    resetSession() {
        super.resetSession();
        this.#analysisRequest++;
        this.#resizeObserver?.disconnect();
        this.#resizeObserver = undefined;
        window.clearTimeout(this.#previewThresholdTimeout);
        window.clearTimeout(this.#resizeAnalysisTimeout);
        this.#previewThresholdTimeout = undefined;
        this.#resizeAnalysisTimeout = undefined;
        this._analyzing = false;
    }

    /** @returns {boolean} Whether the dimensions changed. */
    #updateCanvasSize() {
        const { width, height } = this.session.source.getLogicalCanvasSize();
        const logicalWidth = Math.round(width);
        const logicalHeight = Math.round(height);
        const changed =
            logicalWidth !== this._dimensions.logicalWidth ||
            logicalHeight !== this._dimensions.logicalHeight;

        if (changed) {
            this._dimensions = { logicalWidth, logicalHeight };
        }
        return changed;
    }

    #scheduleLayerAnalysis() {
        this.#analysisRequest++;
        this._analyzing = true;
        if (this.#resizeAnalysisTimeout !== undefined) {
            window.clearTimeout(this.#resizeAnalysisTimeout);
        }
        this.#resizeAnalysisTimeout = window.setTimeout(() => {
            this.#resizeAnalysisTimeout = undefined;
            void this.#analyzeLayers();
        }, 500);
    }

    /** @returns {import("./imageExportSupport.js").SvgExportOptions} */
    getExportOptions() {
        return {
            ...this._dimensions,
            ...(this.rasterizeDenseMarks && {
                rasterization: {
                    maxVectorInstances: this.maxVectorInstances,
                    pixelRatio: this.rasterPixelRatio,
                },
            }),
        };
    }

    /** @returns {import("./imageExportSupport.js").SvgExportLayer[]} */
    getRasterizedLayers() {
        return this.rasterizeDenseMarks &&
            Number.isFinite(this._previewMaxVectorInstances)
            ? this._layers.filter(
                  (layer) =>
                      layer.instanceCount > this._previewMaxVectorInstances
              )
            : [];
    }

    renderBody() {
        const { logicalWidth, logicalHeight } = this._dimensions;

        return html`
            <div class="gs-alert info">
                ${renderIcon(faInfoCircle)}
                <span>
                    SVG export keeps the image as editable vector graphics.
                    Dense layers can be embedded as raster images to keep the
                    file smaller and faster to load.
                </span>
            </div>

            ${this.renderExportError()}

            <div class="gs-form-group">
                <label for="svgDimensions">Visualization dimensions</label>
                <input
                    type="text"
                    id="svgDimensions"
                    .value=${`${logicalWidth} x ${logicalHeight}`}
                    disabled
                />
                <small
                    >Dimensions are based on the current canvas size. Resize the
                    visualization area to change them.</small
                >
            </div>

            <div class="gs-form-group">
                <label class="checkbox-row">
                    <input
                        type="checkbox"
                        id="svgRasterizeDenseMarks"
                        ?checked=${this.rasterizeDenseMarks}
                        ?disabled=${this._saving}
                        @change=${inputListener((input) => {
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
                    ?disabled=${!this.rasterizeDenseMarks || this._saving}
                    @input=${inputListener((input) => {
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
                        ?disabled=${!this.rasterizeDenseMarks || this._saving}
                        @input=${inputListener((input) => {
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
                <div role="status">${this.#renderRasterizationPreview()}</div>
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
            this._previewMaxVectorInstances = value;
            this.#previewThresholdTimeout = undefined;
        }, 500);
    }

    #renderRasterizationPreview() {
        if (!this.rasterizeDenseMarks) {
            return html`<div class="raster-preview">
                All layers will remain vector.
            </div>`;
        } else if (this._analyzing) {
            return html`<div class="raster-preview">
                Analyzing visible layers…
            </div>`;
        } else if (this._analysisError) {
            return html`<div class="raster-preview">
                Layer analysis failed: ${this._analysisError}
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
        const session = this.session;
        if (!this.isCurrentSession(session)) {
            return;
        }
        const request = ++this.#analysisRequest;
        const isCurrent = () =>
            request === this.#analysisRequest && this.isCurrentSession(session);

        this._analyzing = true;
        this._analysisError = "";
        try {
            const analysis = await session.source.imageExport.analyzeSvg(
                this._dimensions
            );
            if (isCurrent()) {
                this._layers = analysis.layers;
            }
        } catch (error) {
            if (isCurrent()) {
                this._analysisError =
                    error instanceof Error ? error.message : String(error);
            }
        } finally {
            if (isCurrent()) {
                this._analyzing = false;
            }
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
                    this._saving ||
                    (this.rasterizeDenseMarks && invalidThreshold),
            }),
        ];
    }

    #downloadSvg() {
        return this.download(async (source) => {
            if (this.#updateCanvasSize()) {
                this.#scheduleLayerAnalysis();
            }
            const { blob, warnings, rasterized } = await source.imageExport.svg(
                this.getExportOptions()
            );
            warnings.forEach((warning) => console.warn(warning));
            return { blob, data: { warnings, rasterized } };
        });
    }
}

/**
 * @param {import("./imageExportSupport.js").SvgExportLayer} layer
 */
function getLayerDisplayName(layer) {
    return layer.viewTitle || layer.viewPath.replace(/^viewRoot\//, "");
}
