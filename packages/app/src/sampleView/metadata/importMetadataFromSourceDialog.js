import { css, html, nothing } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faExclamationCircle,
    faInfoCircle,
    faFileImport,
    faTimesCircle,
} from "@fortawesome/free-solid-svg-icons";
import BaseDialog, { showDialog } from "../../components/generic/baseDialog.js";
import "../../components/generic/multiSelect.js";
import { FormController } from "../../components/forms/formController.js";
import { formField } from "../../components/forms/formField.js";
import {
    classifyImportReadiness,
    parseColumnQueries,
} from "./metadataSourceImportUtils.js";
import ObjectSearchIndex from "../../utils/objectSearchIndex.js";
import { createMetadataSourceAdapter } from "./metadataSourceAdapters.js";
import { validateMetadata } from "./metadataValidation.js";

const DEFAULT_COLUMN_PLACEHOLDER = "Type to search or paste one id per line";
const MAX_SEARCH_SUGGESTIONS = 100;

/**
 * @typedef {{ severity: "info" | "warning" | "error", summary: string, details?: string }} AlignmentIssue
 */

/**
 * @param {ReturnType<typeof validateMetadata>} validation
 * @param {(values: Iterable<string>) => string} formatCases
 * @returns {AlignmentIssue | null}
 */
function buildAlignmentIssue(validation, formatCases) {
    if ("error" in validation) {
        const first = validation.error[0];
        const message =
            typeof first?.message === "string"
                ? first.message
                : "Invalid sample ids in metadata source.";
        return {
            severity: "error",
            summary: "Sample-id alignment check failed: " + String(message),
        };
    }

    const stats = validation.statistics;
    const unknownCount = stats.unknownSamples.size;
    const notCoveredCount = stats.notCoveredSamples.size;
    const overlapCount = stats.samplesInBoth.size;

    if (overlapCount === 0) {
        const sourceOnly =
            unknownCount > 0
                ? " source-only IDs: " +
                  String(unknownCount) +
                  formatCases(stats.unknownSamples)
                : "";
        return {
            severity: "error",
            summary: "No matching sample IDs. Import cannot continue.",
            details: sourceOnly.trim(),
        };
    }

    if (unknownCount > 0 || notCoveredCount > 0) {
        /** @type {string[]} */
        const parts = [];
        if (unknownCount > 0) {
            parts.push(
                String(unknownCount) +
                    " source sample IDs are not in the loaded sample set" +
                    formatCases(stats.unknownSamples)
            );
        }
        if (notCoveredCount > 0) {
            parts.push(
                String(notCoveredCount) +
                    " loaded sample-set IDs are not in the source" +
                    formatCases(stats.notCoveredSamples)
            );
        }
        return {
            severity: "warning",
            summary:
                "Some sample IDs do not match. Import can continue: values will be added only to matched samples.",
            details: parts.join("; "),
        };
    }

    return null;
}

export class ImportMetadataFromSourceDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        sampleView: {},
        intentPipeline: {},
        source: {},
        columnInput: { state: true },
        groupPath: { state: true },
        _loading: { state: true },
        _error: { state: true },
        _preview: { state: true },
        _columnPlaceholder: { state: true },
        _availableColumnCount: { state: true },
        _alignmentIssue: { state: true },
        _showAlignmentDetails: { state: true },
    };

    static styles = [
        ...super.styles,
        css`
            dialog {
                width: min(680px, calc(100vw - 2rem));
            }

            .stack {
                display: block;
            }

            .stack > .gs-form-group {
                margin-top: 0;
                margin-bottom: 0;
            }

            .stack > .gs-form-group + .gs-form-group {
                margin-top: var(--gs-basic-spacing, 10px);
            }

            .inline-link {
                appearance: none;
                background: none;
                border: 0;
                color: inherit;
                cursor: pointer;
                font: inherit;
                padding: 0;
                text-decoration: underline;
            }
        `,
    ];

    constructor() {
        super();

        /** @type {import("../sampleView.js").default | null} */
        this.sampleView = null;

        /** @type {import("../../state/intentPipeline.js").default | null} */
        this.intentPipeline = null;

        /** @type {import("@genome-spy/app/spec/sampleView.js").MetadataSourceDef | null} */
        this.source = null;

        this.columnInput = "";
        this.groupPath = "";
        this._loading = false;
        this._error = "";
        this._preview = null;
        this._columnPlaceholder = DEFAULT_COLUMN_PLACEHOLDER;
        this._availableColumnCount = undefined;
        /** @type {ObjectSearchIndex<{ id: string }>} */
        this._columnSearchIndex = new ObjectSearchIndex(
            [],
            (column) => column.id
        );
        this._previewVersion = 0;
        this._sourceContextVersion = 0;
        this._previewQueryKey = "";
        /** @type {AlignmentIssue | null} */
        this._alignmentIssue = null;
        this._showAlignmentDetails = false;
        this._columnValidationEnabled = false;
        /** @type {ReturnType<typeof createMetadataSourceAdapter> | null} */
        this._adapter = null;

        /** @type {FormController} */
        this._form = new FormController(this);
        this._form.defineField("columns", {
            valueKey: "columnInput",
            validate: () => this.#validateColumns(),
        });
        this._form.defineField("group", {
            valueKey: "groupPath",
            validate: () => null,
        });

        /** @type {string | import("lit").TemplateResult} */
        this.dialogTitle = "Import metadata from source";
    }

    /**
     * @param {import("lit").PropertyValues<this>} changedProperties
     */
    willUpdate(changedProperties) {
        if (!this.sampleView || !this.source) {
            return;
        }

        if (
            changedProperties.has("sampleView") ||
            changedProperties.has("source")
        ) {
            void this.#loadSource();
        }
    }

    renderBody() {
        if (!this.sampleView || !this.source) {
            throw new Error(
                "Import metadata dialog requires SampleView and a metadata source."
            );
        }

        const readiness = this._preview?.readiness;
        const blocking = readiness?.blocking;
        /** @type {AlignmentIssue | null} */
        const alignmentIssue = this._alignmentIssue;
        const columnsLabel =
            typeof this._availableColumnCount === "number"
                ? "Columns to import (" +
                  String(this._availableColumnCount) +
                  " available)"
                : "Columns to import";

        return html`
            <div class="stack">
                <div class="gs-alert info">
                    ${icon(faInfoCircle).node[0]}
                    <div>
                        Import one or more metadata columns by searching,
                        selecting, or pasting column ids.
                    </div>
                </div>

                ${alignmentIssue
                    ? html`<div
                          class="gs-alert ${alignmentIssue.severity === "error"
                              ? "danger"
                              : alignmentIssue.severity}"
                      >
                          ${icon(
                              alignmentIssue.severity === "info"
                                  ? faInfoCircle
                                  : alignmentIssue.severity === "warning"
                                    ? faExclamationCircle
                                    : faTimesCircle
                          ).node[0]}
                          <span>
                              ${alignmentIssue.summary}${alignmentIssue.details
                                  ? this._showAlignmentDetails
                                      ? html` ${alignmentIssue.details}`
                                      : html` <button
                                            class="inline-link"
                                            type="button"
                                            @click=${(
                                                /** @type {MouseEvent} */ event
                                            ) =>
                                                this.#showAlignmentDetails(
                                                    event
                                                )}
                                        >
                                            Show the problems
                                        </button>`
                                  : nothing}
                          </span>
                      </div>`
                    : nothing}

                <div class="gs-form-group">
                    <div class="label">${columnsLabel}</div>
                    <gs-multi-select
                        id="columnInput"
                        autofocus
                        class=${this._form.error("columns") ? "is-invalid" : ""}
                        .debounceMs=${50}
                        .selectedValues=${parseColumnQueries(this.columnInput)}
                        .placeholder=${this._columnPlaceholder}
                        .search=${(/** @type {string} */ query) =>
                            this.#searchAvailableColumns(query)}
                        .allowUnknown=${true}
                        .maxSuggestions=${MAX_SEARCH_SUGGESTIONS}
                        aria-invalid=${this._form.error("columns")
                            ? "true"
                            : "false"}
                        @focusin=${() => this.#handleColumnsFocus()}
                        @change=${(/** @type {Event} */ event) =>
                            this.#handleColumnSelectionChange(event)}
                    ></gs-multi-select>
                    ${this._form.feedback("columns")}
                </div>

                <div class="gs-form-group">
                    <label for="groupPath">Group path (optional)</label>
                    <input
                        id="groupPath"
                        type="text"
                        ${formField(this._form, "group")}
                    />
                </div>

                ${blocking?.overLimit
                    ? html`<div class="gs-alert danger">
                          Import exceeds the hard limit of 100 columns.
                      </div>`
                    : nothing}
                ${this._error
                    ? html`<div class="gs-alert danger">${this._error}</div>`
                    : nothing}
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

    async #loadSource() {
        if (!this.sampleView || !this.source) {
            throw new Error(
                "Import metadata dialog requires SampleView and a metadata source."
            );
        }

        this._previewVersion++;
        this._adapter = null;
        this._error = "";
        this._preview = null;
        this._alignmentIssue = null;
        this._showAlignmentDetails = false;
        this._columnValidationEnabled = false;
        this._columnSearchIndex.replace([]);
        const sourceLabel = this.source.name ?? this.source.id ?? "source";
        this.dialogTitle = html`Import metadata from
            <em>${sourceLabel}</em> source`;
        this.groupPath = this.source.groupPath ?? "";
        void this.#refreshSourceContext();
        void this.#updatePreview();
    }

    #getAdapter() {
        if (!this.sampleView || !this.source) {
            throw new Error(
                "Import metadata dialog requires SampleView and a metadata source."
            );
        }

        if (this._adapter) {
            return this._adapter;
        }

        this._adapter = createMetadataSourceAdapter(this.source, {
            baseUrl: this.sampleView.getBaseUrl(),
        });
        return this._adapter;
    }

    #handleColumnsFocus() {
        this._columnValidationEnabled = true;
    }

    /**
     * @param {Event} event
     */
    #handleColumnSelectionChange(event) {
        const change =
            /** @type {import("../../components/generic/multiSelect.js").MultiSelectChangeEvent} */ (
                event
            );
        this.#setColumnSelection(change.values);
    }

    /**
     * @param {string[]} columnIds
     */
    #setColumnSelection(columnIds) {
        const normalized = parseColumnQueries(columnIds.join("\n"));
        this.columnInput = normalized.join("\n");
        void this.#updatePreview();
    }

    #revalidateColumnsAfterPreview() {
        if (this._columnValidationEnabled || this._form.error("columns")) {
            this._form.revalidate("columns");
        }
    }

    /**
     * @param {string} query
     * @returns {Promise<string[]>}
     */
    async #searchAvailableColumns(query) {
        const term = query.trim();
        return Array.from(
            this._columnSearchIndex.searchByPrefix(term),
            (column) => column.id
        );
    }

    async #updatePreview() {
        if (!this.sampleView || !this.source) {
            return;
        }

        const previewVersion = ++this._previewVersion;
        const queries = parseColumnQueries(this.columnInput);
        const queryKey = this.#toQueryKey(queries);
        if (queries.length === 0) {
            const readiness = classifyImportReadiness({
                queries,
                resolved: {
                    columnIds: [],
                    missing: [],
                    ambiguous: [],
                },
            });
            this._preview = {
                readiness,
            };
            this._previewQueryKey = queryKey;
            this._error = "";
            this.#revalidateColumnsAfterPreview();
            return;
        }

        const adapter = this.#getAdapter();

        try {
            const resolved = await adapter.resolveColumns(queries);
            if (previewVersion !== this._previewVersion) {
                return;
            }
            const readiness = classifyImportReadiness({ queries, resolved });
            this._preview = {
                readiness,
            };
            this._previewQueryKey = queryKey;
            this._error = "";
            this.#revalidateColumnsAfterPreview();
        } catch (error) {
            if (previewVersion !== this._previewVersion) {
                return;
            }
            this._error = String(error);
            this._preview = null;
            this._previewQueryKey = "";
            this.#revalidateColumnsAfterPreview();
        }
    }

    #refreshSourceContext() {
        if (!this.sampleView || !this.source) {
            return;
        }

        const version = ++this._sourceContextVersion;
        const adapter = this.#getAdapter();

        void adapter
            .listColumns()
            .then((columns) => {
                if (version !== this._sourceContextVersion) {
                    return;
                }
                this.#applyColumns(columns);
            })
            .catch(() => {
                if (version !== this._sourceContextVersion) {
                    return;
                }
                this._columnPlaceholder = DEFAULT_COLUMN_PLACEHOLDER;
                this._availableColumnCount = undefined;
                this._columnSearchIndex.replace([]);
            });

        void adapter
            .listSampleIds()
            .then((sourceSampleIds) => {
                if (version !== this._sourceContextVersion) {
                    return;
                }
                this.#applyAlignmentIssue(sourceSampleIds);
                this._showAlignmentDetails = false;
            })
            .catch((error) => {
                if (version !== this._sourceContextVersion) {
                    return;
                }
                this._alignmentIssue = {
                    severity: "error",
                    summary:
                        "Could not validate sample-id alignment: " +
                        String(error),
                };
                this._showAlignmentDetails = false;
            });
    }

    /**
     * @param {{ id: string }[]} columns
     */
    #applyColumns(columns) {
        this._columnSearchIndex.replace(columns);
        this._availableColumnCount = columns.length;
        this._columnPlaceholder = DEFAULT_COLUMN_PLACEHOLDER;
    }

    /**
     * @param {string[]} sourceSampleIds
     */
    #applyAlignmentIssue(sourceSampleIds) {
        if (!this.sampleView) {
            return;
        }

        const viewSampleIds = this.sampleView.sampleHierarchy.sampleData?.ids;
        if (!viewSampleIds) {
            this._alignmentIssue = {
                severity: "error",
                summary:
                    "Could not validate sample-id alignment: Sample data has not been initialized.",
            };
            return;
        }

        const validation = validateMetadata(
            viewSampleIds,
            sourceSampleIds.map((sampleId) => ({ sample: sampleId }))
        );
        this._alignmentIssue = buildAlignmentIssue(validation, (values) =>
            this.#formatCases(values)
        );
    }

    /**
     * @param {MouseEvent} event
     */
    #showAlignmentDetails(event) {
        event.preventDefault();
        this._showAlignmentDetails = true;
    }

    #canImport() {
        if (this._loading || this._form.hasErrors()) {
            return false;
        }

        if (this._alignmentIssue?.severity === "error") {
            return false;
        }

        const queries = parseColumnQueries(this.columnInput);
        if (queries.length === 0) {
            return false;
        }

        if (!this.source) {
            return false;
        }

        if (this.#isPreviewCurrent(queries) && this._preview) {
            const blocking = this._preview.readiness.blocking;
            if (blocking.noResolvableColumns || blocking.overLimit) {
                return false;
            }
        }

        return true;
    }

    async #handleImport() {
        if (!this.sampleView || !this.intentPipeline) {
            throw new Error(
                "Import metadata dialog requires SampleView and IntentPipeline."
            );
        }

        this._columnValidationEnabled = true;
        await this.#updatePreview();
        if (this._form.validateAll()) {
            return true;
        }

        if (!this.#canImport()) {
            return true;
        }

        if (!this.source) {
            return true;
        }

        this._loading = true;
        this._error = "";

        try {
            /** @type {import("../state/payloadTypes.js").AddMetadataFromSource} */
            const actionPayload = {
                columnIds: this._preview.readiness.resolved.columnIds,
            };
            if (this.source.id) {
                actionPayload.sourceId = this.source.id;
            }
            // Always send the explicit dialog value so clearing the field
            // overrides any source-level default group path.
            actionPayload.groupPath = this.groupPath.trim();

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

    /**
     * @returns {string | null}
     */
    #validateColumns() {
        const queries = parseColumnQueries(this.columnInput);
        if (queries.length === 0) {
            return this._columnValidationEnabled
                ? "Enter at least one column id."
                : null;
        }

        const readiness = this._preview?.readiness;
        if (!readiness || !this.#isPreviewCurrent(queries)) {
            return null;
        }

        const blocking = readiness.blocking;
        if (blocking.overLimit) {
            return "Import exceeds the hard limit of 100 columns.";
        }
        if (blocking.noResolvableColumns) {
            return "No matching columns were found.";
        }
        const unresolved = [
            ...readiness.warnings.missing,
            ...readiness.warnings.ambiguous,
        ];
        if (unresolved.length > 0) {
            return (
                "Columns not found: " +
                this.#formatColumnList(unresolved) +
                ". Fix the list before importing."
            );
        }

        return null;
    }

    /**
     * @param {string[]} queries
     */
    #isPreviewCurrent(queries) {
        return this._previewQueryKey === this.#toQueryKey(queries);
    }

    /**
     * @param {string[]} queries
     */
    #toQueryKey(queries) {
        return queries.join("\n");
    }

    /**
     * @param {string[]} columns
     */
    #formatColumnList(columns) {
        const unique = Array.from(new Set(columns));
        if (unique.length <= 8) {
            return unique.join(", ");
        }
        return (
            unique.slice(0, 8).join(", ") +
            " and " +
            String(unique.length - 8) +
            " more"
        );
    }

    /**
     * @param {Iterable<string>} values
     * @param {number} [maxCasesToShow]
     */
    #formatCases(values, maxCasesToShow = 3) {
        const cases = Array.from(values);
        if (cases.length === 0) {
            return "";
        }
        if (cases.length <= maxCasesToShow) {
            return " (e.g. " + cases.join(", ") + ")";
        }
        return (
            " (e.g. " +
            cases.slice(0, maxCasesToShow).join(", ") +
            " and " +
            String(cases.length - maxCasesToShow) +
            " more)"
        );
    }
}

customElements.define(
    "gs-import-metadata-source-dialog",
    ImportMetadataFromSourceDialog
);

/**
 * @param {import("../sampleView.js").default} sampleView
 * @param {import("../../state/intentPipeline.js").default} intentPipeline
 * @param {import("@genome-spy/app/spec/sampleView.js").MetadataSourceDef} source
 */
export function showImportMetadataFromSourceDialog(
    sampleView,
    intentPipeline,
    source
) {
    if (!source) {
        throw new Error("Import metadata dialog requires a metadata source.");
    }

    return showDialog(
        "gs-import-metadata-source-dialog",
        (/** @type {ImportMetadataFromSourceDialog} */ dialog) => {
            dialog.sampleView = sampleView;
            dialog.intentPipeline = intentPipeline;
            dialog.source = source;
            dialog._columnValidationEnabled = false;
            dialog._form.reset();
        }
    );
}
