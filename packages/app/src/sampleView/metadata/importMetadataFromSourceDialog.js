import { css, html, nothing } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faExclamationCircle,
    faFileImport,
} from "@fortawesome/free-solid-svg-icons";
import BaseDialog, { showDialog } from "../../components/generic/baseDialog.js";
import {
    classifyImportReadiness,
    parseColumnQueries,
} from "./metadataSourceImportUtils.js";
import { createMetadataSourceAdapter } from "./metadataSourceAdapters.js";

/**
 * @typedef {object} SourceOption
 * @property {string} id
 * @property {string} label
 * @property {import("@genome-spy/app/spec/sampleView.js").MetadataSourceDef} source
 */

export class ImportMetadataFromSourceDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        sampleView: {},
        intentPipeline: {},
        sourceId: { state: true },
        columnInput: { state: true },
        groupPath: { state: true },
        _loading: { state: true },
        _error: { state: true },
        _preview: { state: true },
        _availableSources: { state: true },
    };

    static styles = [
        ...super.styles,
        css`
            dialog {
                width: min(680px, calc(100vw - 2rem));
            }

            .stack {
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
            }

            textarea {
                min-height: 10rem;
                resize: vertical;
                width: 100%;
            }

            .stats {
                display: flex;
                gap: 1rem;
                flex-wrap: wrap;
                color: var(--gs-muted-color, #666);
                font-size: 0.9rem;
            }

            .file-input {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
        `,
    ];

    constructor() {
        super();

        /** @type {import("../sampleView.js").default | null} */
        this.sampleView = null;

        /** @type {import("../../state/intentPipeline.js").default | null} */
        this.intentPipeline = null;

        this.sourceId = "";
        this.columnInput = "";
        this.groupPath = "";
        this._loading = false;
        this._error = "";
        this._preview = null;
        /** @type {SourceOption[]} */
        this._availableSources = [];

        this.dialogTitle = "Import metadata from source";
    }

    /**
     * @param {import("lit").PropertyValues<this>} changedProperties
     */
    willUpdate(changedProperties) {
        if (!this.sampleView) {
            return;
        }

        if (changedProperties.has("sampleView")) {
            this.#loadSources();
        }

        if (
            changedProperties.has("sourceId") ||
            changedProperties.has("columnInput")
        ) {
            void this.#updatePreview();
        }
    }

    renderBody() {
        if (!this.sampleView) {
            throw new Error("Import metadata dialog requires SampleView.");
        }

        const readiness = this._preview?.readiness;
        const warnings = readiness?.warnings;
        const blocking = readiness?.blocking;
        const sourceCount = this._availableSources.length;
        const selectedSource = this._availableSources.find(
            (source) => source.id === this.sourceId
        );
        const missingStableSourceId =
            sourceCount > 1 && selectedSource && !selectedSource.source.id;
        const canImport =
            !!readiness &&
            !blocking.emptyInput &&
            !blocking.noResolvableColumns &&
            !blocking.overLimit &&
            !missingStableSourceId &&
            !this._loading;

        return html`
            <div class="stack">
                <div class="gs-alert info">
                    ${icon(faExclamationCircle).node[0]}
                    <div>
                        Import one or more metadata attributes by typing or
                        pasting identifiers (one per line, or comma/space
                        separated). Sample-id alignment is validated during
                        import.
                    </div>
                </div>

                ${sourceCount > 1
                    ? html`<div class="gs-form-group">
                          <label for="sourceSelect">Source</label>
                          <select
                              id="sourceSelect"
                              .value=${this.sourceId}
                              @change=${(/** @type {Event} */ event) =>
                                  this.#handleSourceChange(event)}
                          >
                              ${this._availableSources.map(
                                  (source) =>
                                      html`<option value=${source.id}>
                                          ${source.label}
                                      </option>`
                              )}
                          </select>
                      </div>`
                    : nothing}

                <div class="gs-form-group">
                    <label for="columnInput">Attributes / genes</label>
                    <textarea
                        id="columnInput"
                        placeholder="e.g. TP53, MYC, BRCA1"
                        .value=${this.columnInput}
                        @input=${(/** @type {Event} */ event) =>
                            this.#handleColumnInput(event)}
                    ></textarea>
                    <small
                        >Delimiters: newline, comma, tab, semicolon, or
                        whitespace.</small
                    >
                </div>

                <div class="file-input">
                    <label for="columnFile">Load from file</label>
                    <input
                        id="columnFile"
                        type="file"
                        accept=".txt,.tsv,.csv"
                        @change=${(/** @type {Event} */ event) =>
                            this.#handleFileInput(event)}
                    />
                </div>

                <div class="gs-form-group">
                    <label for="groupPath">Group path (optional)</label>
                    <input
                        id="groupPath"
                        type="text"
                        .value=${this.groupPath}
                        @input=${(/** @type {Event} */ event) =>
                            this.#handleGroupPathInput(event)}
                    />
                </div>

                ${this._preview
                    ? html`<div class="stats">
                          <span
                              >Samples in view:
                              ${this._preview.sampleCount}</span
                          >
                          <span
                              >Resolved:
                              ${readiness.resolved.columnIds.length}</span
                          >
                          <span>Missing: ${warnings.missing.length}</span>
                          <span>Ambiguous: ${warnings.ambiguous.length}</span>
                      </div>`
                    : nothing}
                ${blocking?.overLimit
                    ? html`<div class="gs-alert error">
                          Import exceeds the hard limit of 100 columns.
                      </div>`
                    : nothing}
                ${missingStableSourceId
                    ? html`<div class="gs-alert error">
                          Source id is required when multiple metadata sources
                          are configured.
                      </div>`
                    : nothing}
                ${warnings &&
                (warnings.missing.length > 0 || warnings.ambiguous.length > 0)
                    ? html`<div class="gs-alert warning">
                          Missing or ambiguous entries are skipped. Import can
                          continue with resolved columns.
                      </div>`
                    : nothing}
                ${this._error
                    ? html`<div class="gs-alert error">${this._error}</div>`
                    : nothing}
                ${canImport
                    ? nothing
                    : html`<small
                          >Import becomes available after at least one column
                          resolves.</small
                      >`}
            </div>
        `;
    }

    renderButtons() {
        const canImport = this.#canImport();
        return [
            this.makeCloseButton(),
            this.makeButton("Import", () => this.#handleImport(), {
                iconDef: faFileImport,
                isPrimary: true,
                disabled: !canImport,
            }),
        ];
    }

    #loadSources() {
        if (!this.sampleView) {
            throw new Error("Import metadata dialog requires SampleView.");
        }

        const entries = this.sampleView.spec.samples.metadataSources ?? [];
        this._availableSources = entries
            .filter((entry) => !("import" in entry))
            .map((entry, index) => {
                const source =
                    /** @type {import("@genome-spy/app/spec/sampleView.js").MetadataSourceDef} */ (
                        entry
                    );
                const fallbackId = "source_" + String(index + 1);
                return {
                    id: source.id ?? fallbackId,
                    source,
                    label:
                        source.name ??
                        source.id ??
                        "Source " + String(index + 1),
                };
            });

        if (this._availableSources.length > 0) {
            this.sourceId = this._availableSources[0].id;
        }
    }

    /**
     * @param {Event} event
     */
    #handleSourceChange(event) {
        this.sourceId = /** @type {HTMLSelectElement} */ (event.target).value;
    }

    /**
     * @param {Event} event
     */
    #handleColumnInput(event) {
        this.columnInput = /** @type {HTMLTextAreaElement} */ (
            event.target
        ).value;
    }

    /**
     * @param {Event} event
     */
    #handleGroupPathInput(event) {
        this.groupPath = /** @type {HTMLInputElement} */ (event.target).value;
    }

    /**
     * @param {Event} event
     */
    async #handleFileInput(event) {
        const fileInput = /** @type {HTMLInputElement} */ (event.target);
        const file = fileInput.files?.[0];
        if (!file) {
            return;
        }
        this.columnInput = await file.text();
    }

    async #updatePreview() {
        if (!this.sampleView) {
            return;
        }

        const sourceRef = this._availableSources.find(
            (source) => source.id === this.sourceId
        );
        if (!sourceRef) {
            this._preview = null;
            return;
        }

        const queries = parseColumnQueries(this.columnInput);
        const adapter = createMetadataSourceAdapter(sourceRef.source, {
            baseUrl: this.sampleView.getBaseUrl(),
        });

        try {
            const resolved = await adapter.resolveColumns(queries);
            const readiness = classifyImportReadiness({ queries, resolved });
            this._preview = {
                readiness,
                sampleCount:
                    this.sampleView.sampleHierarchy.sampleData?.ids.length ?? 0,
            };
            this._error = "";
        } catch (error) {
            this._error = String(error);
            this._preview = null;
        }
    }

    #canImport() {
        if (!this._preview || this._loading) {
            return false;
        }
        const sourceRef = this._availableSources.find(
            (source) => source.id === this.sourceId
        );
        if (
            this._availableSources.length > 1 &&
            sourceRef &&
            !sourceRef.source.id
        ) {
            return false;
        }
        const blocking = this._preview.readiness.blocking;
        return (
            !blocking.emptyInput &&
            !blocking.noResolvableColumns &&
            !blocking.overLimit
        );
    }

    async #handleImport() {
        if (!this.sampleView || !this.intentPipeline) {
            throw new Error(
                "Import metadata dialog requires SampleView and IntentPipeline."
            );
        }

        if (!this.#canImport()) {
            return true;
        }

        const sourceRef = this._availableSources.find(
            (source) => source.id === this.sourceId
        );
        if (!sourceRef) {
            return true;
        }

        this._loading = true;
        this._error = "";

        try {
            /** @type {import("../state/payloadTypes.js").AddMetadataFromSource} */
            const actionPayload = {
                columnIds: this._preview.readiness.resolved.columnIds,
            };
            if (sourceRef.source.id) {
                actionPayload.sourceId = sourceRef.source.id;
            }
            if (this.groupPath.trim().length > 0) {
                actionPayload.groupPath = this.groupPath.trim();
            }

            await this.intentPipeline.submit(
                this.sampleView.actions.addMetadataFromSource(actionPayload)
            );
            this.finish({ ok: true });
            return false;
        } catch (error) {
            this._error = String(error);
            this._loading = false;
            return true;
        }
    }
}

customElements.define(
    "gs-import-metadata-source-dialog",
    ImportMetadataFromSourceDialog
);

/**
 * @param {import("../sampleView.js").default} sampleView
 * @param {import("../../state/intentPipeline.js").default} intentPipeline
 */
export function showImportMetadataFromSourceDialog(sampleView, intentPipeline) {
    return showDialog(
        "gs-import-metadata-source-dialog",
        (/** @type {ImportMetadataFromSourceDialog} */ dialog) => {
            dialog.sampleView = sampleView;
            dialog.intentPipeline = intentPipeline;
        }
    );
}
