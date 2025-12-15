import { read } from "vega-loader";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faArrowLeft,
    faArrowRight,
    faUpload,
} from "@fortawesome/free-solid-svg-icons";
import { html, css } from "lit";
import BaseDialog, { showDialog } from "../components/dialogs/baseDialog.js";
import "../components/data-grid/dataGrid.js";
import { createRef, ref } from "lit/directives/ref.js";

class UploadMetadataDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        sampleView: {},
        _fileName: { state: true },
        _dragOver: { state: true },
        _parsedItems: { state: true },
        _page: { state: true },
    };

    constructor() {
        super();

        /** @typer {import("./sampleView.js").default} */
        this.sampleView = null;

        this.dialogTitle = "Load Custom Metadata";

        /** @type {import("lit/directives/ref.js").Ref<HTMLInputElement>} */
        this._fileRef = createRef();

        this._dragOver = false;

        /** @type {any[] | null} */
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

            .drop-zone {
                border: 2px dashed var(--form-control-border-color);
                border-radius: 8px;
                padding: 1.25rem;
                display: flex;
                align-items: center;
                justify-content: center;
                transition:
                    box-shadow 0.15s ease,
                    transform 0.12s ease,
                    background-color 0.12s ease;
                cursor: pointer;
            }

            .drop-zone.drop-over {
                background-color: rgba(106, 160, 255, 0.06);
                border-color: var(--gs-accent-color, #6aa0ff);
                box-shadow: 0 8px 24px rgba(106, 160, 255, 0.08);
            }

            .drop-inner {
                display: flex;
                gap: 1rem;
                align-items: center;
            }

            .drop-icon {
                font-size: 2rem;
            }

            .upload-stats {
                margin-top: var(--gs-basic-spacing, 10px);
                font-size: 90%;
            }
        `,
    ];

    /**
     *
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
        this.#changePage(1);
    }

    async #onFileInputChange() {
        const fileInput = this._fileRef.value;
        if (!fileInput || !fileInput.files || fileInput.files.length === 0)
            return;

        await this.#processFile(fileInput.files[0]);
    }

    /**
     * @param {DragEvent} e
     */
    async #onDropFile(e) {
        e.preventDefault();
        e.stopPropagation();
        const dt = e.dataTransfer;
        if (!dt || !dt.files || dt.files.length === 0) return;
        const file = dt.files[0];
        this._dragOver = false;
        this.requestUpdate();

        await this.#processFile(file);
    }

    /**
     * @param {DragEvent} e
     */
    #onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        this._dragOver = true;
        this.requestUpdate();
    }

    /**
     * @param {DragEvent} e
     */
    #onDragLeave(e) {
        e.preventDefault();
        this._dragOver = false;
        this.requestUpdate();
    }

    #renderUpload() {
        return html` <p>
                Select a metadata file (CSV, TSV or JSON). The file must have a
                header row and a <em>sample</em> column that uniquely identifies
                each sample.
            </p>

            <div
                class=${this._dragOver ? "drop-zone drop-over" : "drop-zone"}
                @dragover=${(/** @type {DragEvent} */ e) => this.#onDragOver(e)}
                @dragleave=${(/** @type {DragEvent} */ e) =>
                    this.#onDragLeave(e)}
                @drop=${(/** @type {DragEvent} */ e) => this.#onDropFile(e)}
            >
                <div class="drop-inner">
                    <div class="drop-icon">${icon(faUpload).node[0]}</div>
                    <div class="drop-text">Drop a file here or</div>
                    <button
                        class="btn"
                        @click=${() => this._fileRef.value?.click()}
                    >
                        Choose file
                    </button>
                </div>
                <input
                    style="display:none"
                    type="file"
                    accept=".csv,.tsv,.json"
                    ${ref(this._fileRef)}
                    @change=${() => this.#onFileInputChange()}
                />
            </div>`;
    }

    #renderPreview() {
        return html`
            <p>Loaded file: <code>${this._fileName}</code></p>

            <div style="margin-top: var(--gs-basic-spacing,10px)">
                <gs-data-grid
                    .items=${this._parsedItems}
                    style="height: 240px"
                ></gs-data-grid>
            </div>
        `;
    }

    renderBody() {
        switch (this._page) {
            case 0:
                return this.#renderUpload();
            case 1:
                return this.#renderPreview();
            default:
                return html`<p>Invalid page</p>`;
        }
    }

    /**
     * @param {-1 | 1} direction
     */
    #changePage(direction) {
        const newPage = this._page + direction;
        if (newPage < 0) return;

        this._page += direction;

        // Prevent closing the dialog
        return true;
    }

    #canAdvancePage() {
        // Currently only 2 pages (0 and 1)
        return this._page === 0 && this._parsedItems;
    }

    renderButtons() {
        return [
            this.makeCloseButton("Cancel"),
            this.makeButton(
                "Previous",
                () => this.#changePage(-1),
                faArrowLeft,
                this._page === 0
            ),
            this.makeButton(
                "Next",
                () => this.#changePage(1),
                faArrowRight,
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
    return showDialog("gs-upload-metadata-dialog", (/** @type {any} */ el) => {
        el.sampleView = sampleView;
    });
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
