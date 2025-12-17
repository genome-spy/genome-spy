import { read } from "vega-loader";
import {
    faCaretLeft,
    faCaretRight,
    faExclamationCircle,
    faInfoCircle,
    faTimesCircle,
} from "@fortawesome/free-solid-svg-icons";
import { html, css } from "lit";
import BaseDialog, { showDialog } from "../components/generic/baseDialog.js";
import "../components/generic/dataGrid.js";
import "../components/generic/uploadDropZone.js";
import { icon } from "@fortawesome/fontawesome-svg-core";

/**
 * @typedef {object} MetadataUploadResult
 * @prop {import("./state/sampleState.js").Metadatum[]} metadataTable
 */
class UploadMetadataDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        sampleView: {},
        _fileName: { state: true },
        _parsedItems: { state: true },
        _page: { state: true },
    };

    /** @type {ReturnType<typeof validateMetadata>} */
    #validationResult;

    /**
     * @type {{title: string, render: () => import("lit").TemplateResult<1>, canAdvance?: () => boolean, onAdvance?: () => boolean}[]}
     */
    #pages = [
        {
            title: "Load",
            render: () => this.#renderUpload(),
            canAdvance: () => this._parsedItems != null,
        },
        {
            title: "Preview & Validate",
            render: () => this.#renderPreview(),
            canAdvance: () =>
                this.#validationResult?.statistics?.samplesInBoth?.size > 0,
        },
        {
            title: "Configure Attributes",
            render: () => this.#renderConfiguration(),
            onAdvance: () => this.#submit(),
        },
    ];

    constructor() {
        super();

        /** @type {import("./sampleView.js").default} */
        this.sampleView = null;

        this.dialogTitle = "Load Custom Metadata";

        /** @type {Record<string, any>[]} */
        this._parsedItems = null;

        /** @type {string} */
        this._fileName = null;

        this._page = 0;
    }

    static styles = [
        ...super.styles,
        css`
            dialog {
                width: 600px;
            }

            .upload-stats {
                margin-top: var(--gs-basic-spacing, 10px);
                font-size: 90%;
            }
        `,
    ];

    #submit() {
        this.finish({
            ok: true,
            data: /** @type {MetadataUploadResult} */ ({
                metadataTable: this._parsedItems,
            }),
        });
        this.triggerClose();
        return false;
    }

    /**
     * @param {File} file
     */
    async #processFile(file) {
        const textContent = await readFileAsync(file);

        // TODO: Do all sorts of validation. There must be a sample column, etc.

        const type = inferFileType(textContent, file.name);

        this._parsedItems =
            /** @type {import("@genome-spy/core/data/flowNode.js").Data} */
            (read(textContent, { type, parse: "auto" }));
        this._fileName = file.name;

        this.#validationResult = validateMetadata(
            this.sampleView.sampleHierarchy.sampleData.ids,
            this._parsedItems
        );

        this.#changePage(1);
    }

    /**
     * @param {import("../components/generic/uploadDropZone.js").FilesChosenEvent} e
     */
    async #onFilesChosen(e) {
        const file = e.detail.files[0];
        await this.#processFile(file);
    }

    #renderUpload() {
        return html`<p>
                This wizard helps you load custom metadata for samples in the
                current visualization.
            </p>

            <p>
                Select a metadata file (CSV, TSV, or JSON). The file must
                include a header row and a <em>sample</em> column that uniquely
                identifies each sample. Additional columns will be added as new
                metadata fields.
            </p>

            <gs-upload-drop-zone
                accept=".csv,.tsv,.json"
                @gs-files-chosen=${(
                    /** @type {import("../components/generic/uploadDropZone.js").FilesChosenEvent} */ e
                ) => this.#onFilesChosen(e)}
            ></gs-upload-drop-zone>`;
    }

    #renderValidationResults() {
        if (this.#validationResult.error) {
            return html`<div class="gs-alert danger">
                ${icon(faTimesCircle).node[0]}
                <div>
                    <p>Errors found in metadata:</p>
                    <ul>
                        ${this.#validationResult.error.map(
                            (err) => html`<li>${formatErrorEntry(err)}</li>`
                        )}
                    </ul>
                    <p>Please fix the errors and try again.</p>
                </div>
            </div>`;
        } else if (this.#validationResult.statistics) {
            const stats = this.#validationResult.statistics;
            const caveats =
                stats.unknownSamples.size > 0 ||
                stats.notCoveredSamples.size > 0;
            return html`<div
                class="${caveats ? "gs-alert warning" : "gs-alert info"}"
            >
                ${icon(caveats ? faExclamationCircle : faInfoCircle).node[0]}
                <div>
                    <p>
                        ${caveats
                            ? "Metadata loaded (with caveats)!"
                            : "Metadata loaded successfully!"}
                    </p>
                    <ul>
                        <li>
                            Unknown samples to be ignored:
                            <span>${stats.unknownSamples.size}</span
                            >${formatCases(stats.unknownSamples)}
                        </li>
                        <li>
                            Existing samples not covered by loaded metadata:
                            <span>${stats.notCoveredSamples.size}</span
                            >${formatCases(stats.notCoveredSamples)}
                        </li>
                        <li>
                            Matching samples:
                            <span>${stats.samplesInBoth.size}</span>
                        </li>
                    </ul>
                </div>
            </div>`;
        }
    }

    #renderPreview() {
        return html`
            ${this.#renderValidationResults()}

            <p>Data preview (<code>${this._fileName}</code>):</p>

            <div style="margin-top: var(--gs-basic-spacing, 10px)">
                <gs-data-grid
                    .items=${this._parsedItems}
                    style="height: 240px"
                ></gs-data-grid>
            </div>
        `;
    }

    #renderConfiguration() {
        return html`<p>Configuration page (not implemented yet)</p>`;
    }

    renderBody() {
        const pageEntry = this.#pages[this._page];
        if (!pageEntry) {
            return html`<p>Invalid page</p>`;
        }
        return pageEntry.render();
    }

    /**
     * @param {-1 | 1} direction
     */
    #changePage(direction) {
        if (direction > 0) {
            const pageEntry = this.#pages[this._page];
            if (typeof pageEntry.onAdvance === "function") {
                pageEntry.onAdvance();
            }
        }

        const newPage = this._page + direction;
        if (newPage < 0 || newPage >= this.#pages.length) {
            return true;
        }

        this._page = newPage;

        // Prevent closing the dialog
        return true;
    }

    #canAdvancePage() {
        const pageEntry = this.#pages[this._page];
        if (typeof pageEntry.canAdvance === "function") {
            return !!pageEntry.canAdvance();
        }
        return true;
    }

    renderButtons() {
        const next =
            this._page === this.#pages.length - 1
                ? { label: "Finish", icon: null }
                : { label: "Next", icon: faCaretRight };

        return [
            this.makeCloseButton("Cancel"),
            this.makeButton(
                "Previous",
                () => this.#changePage(-1),
                faCaretLeft,
                this._page === 0
            ),
            this.makeButton(
                next.label,
                () => this.#changePage(1),
                next.icon,
                !this.#canAdvancePage()
            ),
        ];
    }
}

customElements.define("gs-upload-metadata-dialog", UploadMetadataDialog);

/**
 * @param {import("./sampleView.js").default} sampleView
 */
export function showUploadMetadataDialog(sampleView) {
    return showDialog(
        "gs-upload-metadata-dialog",
        (/** @type {UploadMetadataDialog} */ el) => {
            el.sampleView = sampleView;
        }
    ).then((result) => {
        if (!result.ok) {
            return false;
        }

        const existingIds = new Set(sampleView.sampleHierarchy.sampleData.ids);

        const metadata = Object.fromEntries(
            /** @type {MetadataUploadResult} */ (result.data).metadataTable
                .filter((record) => existingIds.has(String(record.sample)))
                .map((record) => {
                    const { sample, ...rest } = record;
                    return [String(sample), rest];
                })
        );

        // Temporary definition for expression data

        /** @type {Record<string, import("@genome-spy/core/spec/sampleView.js").SampleAttributeDef>} */
        const attributeDefs = Object.fromEntries(
            Object.keys(Object.values(metadata)[0]).map((attribute) => [
                attribute,
                {
                    type: "quantitative",
                    scale: {
                        domain: [-5, 0, 5],
                        range: ["#0050f8", "#f6f6f6", "#ff3000"],
                    },
                },
            ])
        );

        sampleView.intentExecutor.dispatch(
            sampleView.actions.setMetadata({ metadata, attributeDefs })
        );
        return true;
    });
}

/**
 * Does the following validations:
 * - `metadataRecords` all have 'sample' field (called newSamples from now on)
 * - `metadataRecords` all have a proper value in 'sample' field
 * - no duplicate sample IDs in newSamples
 * - newSamples has at least one sample
 *
 * On error, return an object with `error` array containing error messages.
 *
 * Does the following calculations:
 * - number of duplicate sample IDs in newSamples
 * - number of unique samples in newSamples that are not in existingSamples
 * - number of samples in existingSamples that are not in newSamples
 * - number of samples in both existingSamples and newSamples
 *
 * Returns an object with `statistics` field containing the calculated statistics.
 *
 * @param {Iterable<string>} existingSamples
 * @param {Iterable<Record<string, any>>} metadataRecords New metadata records to be added
 *
 * @typedef {{message: string | import("lit").TemplateResult<1>, count: number, cases: string[]}} ErrorEntry
 */
export function validateMetadata(existingSamples, metadataRecords) {
    /**
     * @type {Map<any, ErrorEntry>}
     */
    const errorMap = new Map();

    /**
     * @param {string | import("lit").TemplateResult<1>} msg
     * @param {number} [n]
     * @param {string} [caseInfo]
     */
    function addError(msg, n = 1, caseInfo = null) {
        // Use object identity as the key.
        const key = msg;
        let entry = errorMap.get(key);
        if (!entry) {
            entry = { message: msg, count: 0, cases: [] };
            errorMap.set(key, entry);
        }
        entry.count += n;
        if (caseInfo) {
            entry.cases.push(caseInfo);
        }
    }

    const existingSamplesSet = new Set(existingSamples);
    /** @type {Set<string>} */
    const metadataSamplesSet = new Set();

    for (const record of metadataRecords) {
        if (!("sample" in record)) {
            addError(MISSING_SAMPLE_FIELD_ERROR);
            continue;
        }

        if (record.sample == null || record.sample === "") {
            addError(EMPTY_SAMPLE_FIELD_ERROR);
            continue;
        }

        const sampleId = String(record.sample);
        if (metadataSamplesSet.has(sampleId)) {
            addError(DUPLICATE_SAMPLE_IDS_ERROR, 1, sampleId);
        }
        metadataSamplesSet.add(sampleId);
    }

    if (metadataSamplesSet.size === 0) {
        addError(NO_VALID_SAMPLES_ERROR);
    }

    if (errorMap.size > 0) {
        return { error: Array.from(errorMap.values()) };
    }

    return {
        statistics: {
            unknownSamples: metadataSamplesSet.difference(existingSamplesSet),
            notCoveredSamples:
                existingSamplesSet.difference(metadataSamplesSet),
            samplesInBoth: metadataSamplesSet.intersection(existingSamplesSet),
        },
    };
}

export const MISSING_SAMPLE_FIELD_ERROR = html`Missing <em>sample</em> field in
    metadata record`;
export const EMPTY_SAMPLE_FIELD_ERROR = html`Empty <em>sample</em> field in
    metadata record`;
export const DUPLICATE_SAMPLE_IDS_ERROR =
    "Duplicate sample IDs found in metadata";
export const NO_VALID_SAMPLES_ERROR = "No valid samples found in metadata";

/**
 * @param {Iterable<string>} cases
 * @param {number} [maxCasesToShow]
 */
function formatCases(cases, maxCasesToShow = 3) {
    const caseArr = Array.from(cases);

    /**
     * @param {string[]} arr
     * @param {string} [sep]
     */
    const join = (arr, sep = ", ") =>
        arr.map((c, i) => html`${i > 0 ? sep : ""}<code>${c}</code>`);

    if (caseArr.length === 0) {
        return "";
    } else if (caseArr.length <= maxCasesToShow) {
        return html` (e.g., ${join(caseArr)})`;
    } else {
        const shownCases = caseArr.slice(0, maxCasesToShow);
        return html` (e.g., ${join(shownCases)} and
        ${caseArr.length - maxCasesToShow} more)`;
    }
}

/**
 *
 * @param {ErrorEntry} entry
 */
function formatErrorEntry(entry) {
    if (entry.cases.length > 0) {
        return html`${entry.message}${formatCases(entry.cases)}`;
    } else if (entry.count > 1) {
        return html`${entry.message} (occurred ${entry.count} times)`;
    } else {
        return entry.message;
    }
}

// --- copypasted from playground ---

/**
 * https://simon-schraeder.de/posts/filereader-async/
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsync(file) {
    return new Promise((resolve, reject) => {
        let reader = new FileReader();
        reader.onload = () => resolve(/** @type {string} */ (reader.result));
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

/**
 * @param {string} contents
 * @param {string} name
 */
function inferFileType(contents, name) {
    if (/\.json$/.test(name)) {
        return "json";
    } else {
        // In bioinformatics, csv files are often actually tsv files
        return contents.indexOf("\t") >= 0 ? "tsv" : "csv";
    }
}
