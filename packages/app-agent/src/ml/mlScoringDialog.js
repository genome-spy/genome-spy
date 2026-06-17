/**
 * Modal dialog for configuring and launching AlphaGenome / Evo2 variant scoring.
 *
 * Usage:
 *   import { showMlScoringDialog } from "./mlScoringDialog.js";
 *   await showMlScoringDialog(agentApi, variantCollection, options);
 *
 * options: { baseUrl, fastaUrl }
 */

import { css, html, nothing } from "lit";
import { BaseDialog, showDialog } from "@genome-spy/app/dialog";
import { runAlphaGenomeFlow, runEvo2Flow } from "./mlScoring.js";

/** @typedef {"alphagenome" | "evo2"} ModelChoice */
/** @typedef {"idle" | "running" | "done" | "error"} DialogState */

const AG_HEADS = [
    { id: "atac", label: "ATAC-seq" },
    { id: "dnase", label: "DNase-seq" },
    { id: "cage", label: "CAGE" },
    { id: "procap", label: "PRO-cap" },
    { id: "rna_seq", label: "RNA-seq" },
    { id: "chip_tf", label: "ChIP-TF" },
    { id: "chip_histone", label: "ChIP-Histone" },
    { id: "contact_maps", label: "Contact maps" },
];

const DEFAULT_HEADS = new Set(["atac", "dnase", "cage"]);

/** Rough seconds-per-variant estimate for AlphaGenome on a single GPU. */
const AG_SECS_PER_VARIANT = 2;
/** Rough seconds-per-variant estimate for Evo2. */
const EVO2_SECS_PER_VARIANT = 0.5;

/**
 * @param {number} secs
 * @returns {string}
 */
function _formatTime(secs) {
    if (secs < 60) return `~${Math.round(secs)} seconds`;
    const m = Math.round(secs / 60);
    return `~${m} minute${m !== 1 ? "s" : ""}`;
}

class MlScoringDialog extends BaseDialog {
    static properties = {
        ...BaseDialog.properties,
        agentApi: {},
        variantCollection: {},
        baseUrl: {},
        fastaUrl: {},
        // internal
        _model: { state: true },
        _selectedHeads: { state: true },
        _status: { state: true },
        _progressMessage: { state: true },
        _resultMessage: { state: true },
        _errorMessage: { state: true },
    };

    static styles = [
        ...BaseDialog.styles,
        css`
            .ml-dialog-body {
                width: 26em;
            }

            .region-info {
                font-size: 90%;
                color: #555;
                margin-bottom: 0.8em;
            }

            .model-row {
                display: flex;
                gap: 1.5em;
                margin-bottom: 0.8em;
            }

            .model-row label {
                display: flex;
                align-items: center;
                gap: 0.3em;
                cursor: pointer;
                font-weight: normal;
            }

            .heads-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 0.25em 1em;
                margin: 0.5em 0 0.8em;
            }

            .heads-grid label {
                display: flex;
                align-items: center;
                gap: 0.3em;
                cursor: pointer;
                font-weight: normal;
                white-space: nowrap;
            }

            .estimated-time {
                font-size: 85%;
                color: #666;
                margin-top: 0.3em;
            }

            .progress-area {
                padding: 0.5em 0;
                color: #444;
            }

            .result-area {
                color: #2a6e2a;
            }

            .error-area {
                color: #b00;
                word-break: break-word;
            }
        `,
    ];

    constructor() {
        super();
        this.dialogTitle = "ML Variant Scoring";

        /** @type {import("@genome-spy/app/agentApi").AgentApi} */
        this.agentApi = null;

        /** @type {import("./mlVariantCollector.js").VariantCollection} */
        this.variantCollection = null;

        /** @type {number} */
        this._sampleCount = 0;

        /** @type {string} */
        this.baseUrl = "";

        /** @type {string} */
        this.fastaUrl = "";

        /** @type {ModelChoice} */
        this._model = "alphagenome";

        /** @type {Set<string>} */
        this._selectedHeads = new Set(DEFAULT_HEADS);

        /** @type {DialogState} */
        this._status = "idle";

        /** @type {string} */
        this._progressMessage = "";

        /** @type {string} */
        this._resultMessage = "";

        /** @type {string} */
        this._errorMessage = "";

        /** @type {AbortController | null} */
        this._abortController = null;
    }

    get _variantCount() {
        return this.variantCollection.uniqueVariants.size;
    }

    /** @param {Map<PropertyKey, unknown>} changedProperties */
    willUpdate(changedProperties) {
        if (
            changedProperties.has("variantCollection") &&
            this.variantCollection
        ) {
            this._sampleCount = new Set(
                this.variantCollection.allRows.map((r) => r.Sample)
            ).size;
        }
    }

    get _estimatedTime() {
        const n = this._variantCount;
        if (this._model === "evo2")
            return _formatTime(n * EVO2_SECS_PER_VARIANT);
        return _formatTime(n * AG_SECS_PER_VARIANT);
    }

    /** @param {string} head */
    _toggleHead(head) {
        const next = new Set(this._selectedHeads);
        if (next.has(head)) {
            next.delete(head);
        } else {
            next.add(head);
        }
        this._selectedHeads = next;
    }

    renderBody() {
        const { brushInterval } = this.variantCollection;
        const regionText = `${brushInterval[0].toLocaleString()} – ${brushInterval[1].toLocaleString()}`;

        if (this._status === "running") {
            return html`<div class="ml-dialog-body">
                <div class="progress-area">${this._progressMessage}</div>
            </div>`;
        } else if (this._status === "done") {
            return html`<div class="ml-dialog-body">
                <div class="result-area">${this._resultMessage}</div>
            </div>`;
        } else if (this._status === "error") {
            return html`<div class="ml-dialog-body">
                <div class="error-area">${this._errorMessage}</div>
            </div>`;
        } else if (this._status === "idle") {
            return html`<div class="ml-dialog-body">
                <div class="region-info">
                    Region: ${regionText}<br />
                    ${this._variantCount} unique
                    SNV${this._variantCount !== 1 ? "s" : ""} across
                    ${this._sampleCount}
                    sample${this._sampleCount !== 1 ? "s" : ""}
                </div>

                <div class="model-row">
                    <label>
                        <input
                            type="radio"
                            name="ml-model"
                            value="alphagenome"
                            ?checked=${this._model === "alphagenome"}
                            @change=${() => {
                                this._model = "alphagenome";
                            }}
                        />
                        AlphaGenome
                    </label>
                    <label>
                        <input
                            type="radio"
                            name="ml-model"
                            value="evo2"
                            ?checked=${this._model === "evo2"}
                            @change=${() => {
                                this._model = "evo2";
                            }}
                        />
                        Evo2
                    </label>
                </div>

                ${this._model === "alphagenome"
                    ? html`
                          <div>Scoring heads:</div>
                          <div class="heads-grid">
                              ${AG_HEADS.map(
                                  ({ id, label }) => html`
                                      <label>
                                          <input
                                              type="checkbox"
                                              ?checked=${this._selectedHeads.has(
                                                  id
                                              )}
                                              @change=${() =>
                                                  this._toggleHead(id)}
                                          />
                                          ${label}
                                      </label>
                                  `
                              )}
                          </div>
                      `
                    : nothing}

                <div class="estimated-time">
                    Estimated time: ${this._estimatedTime}
                </div>
            </div>`;
        } else {
            throw new Error(`Unknown dialog status: ${this._status}`);
        }
    }

    renderButtons() {
        if (this._status === "running") {
            return [
                this.makeButton("Cancel", () => {
                    this._abortController?.abort();
                    this.finish({ ok: false, reason: "cancel" });
                }),
            ];
        } else if (this._status === "done" || this._status === "error") {
            return [this.makeCloseButton()];
        } else if (this._status === "idle") {
            const canRun =
                this._model === "evo2" || this._selectedHeads.size > 0;
            return [
                this.makeButton("Cancel", () =>
                    this.finish({ ok: false, reason: "cancel" })
                ),
                this.makeButton("Run", () => this._run(), {
                    isPrimary: true,
                    disabled: !canRun,
                }),
            ];
        } else {
            throw new Error(`Unknown dialog status: ${this._status}`);
        }
    }

    /** @returns {true} keep dialog open */
    _run() {
        this._status = "running";
        this._progressMessage = "Preparing…";
        this._abortController = new AbortController();
        const signal = this._abortController.signal;

        this._runAsync(signal).catch((err) => {
            if (signal.aborted) return;
            this._status = "error";
            this._errorMessage = String(err?.message ?? err);
            this.requestUpdate();
        });

        this.requestUpdate();
        return true;
    }

    /** @param {AbortSignal} signal */
    async _runAsync(signal) {
        const onProgress = (/** @type {string} */ msg) => {
            this._progressMessage = msg;
            this.requestUpdate();
        };
        if (this._model === "alphagenome") {
            const heads = [...this._selectedHeads];
            const result = await runAlphaGenomeFlow(
                this.agentApi,
                { baseUrl: this.baseUrl, fastaUrl: this.fastaUrl },
                this.variantCollection,
                heads,
                { signal, onProgress, submissionKind: "user" }
            );
            const colNames = result.colNames.join(", ");
            this._status = "done";
            this._resultMessage = `Added ${heads.length} column${heads.length !== 1 ? "s" : ""} (${colNames}) for ${this._sampleCount} sample${this._sampleCount !== 1 ? "s" : ""}.`;
        } else if (this._model === "evo2") {
            await runEvo2Flow(
                this.agentApi,
                { baseUrl: this.baseUrl, fastaUrl: this.fastaUrl },
                this.variantCollection,
                { signal, onProgress, submissionKind: "user" }
            );
            this._status = "done";
            this._resultMessage = `Added ev2_delta_max column for ${this._sampleCount} sample${this._sampleCount !== 1 ? "s" : ""}.`;
        } else {
            throw new Error(`Unknown model: ${this._model}`);
        }
        this.requestUpdate();
    }
}

customElements.define("gs-ml-scoring-dialog", MlScoringDialog);

/**
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
 * @param {import("./mlVariantCollector.js").VariantCollection} variantCollection
 * @param {{ baseUrl: string; fastaUrl: string }} options
 * @returns {Promise<{ ok: boolean; reason?: string; data?: unknown }>}
 */
export function showMlScoringDialog(agentApi, variantCollection, options) {
    return showDialog(
        "gs-ml-scoring-dialog",
        (/** @type {MlScoringDialog} */ el) => {
            el.agentApi = agentApi;
            el.variantCollection = variantCollection;
            el.baseUrl = options.baseUrl;
            el.fastaUrl = options.fastaUrl;
        }
    );
}
