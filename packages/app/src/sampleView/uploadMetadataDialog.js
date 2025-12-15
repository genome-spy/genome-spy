import { read } from "vega-loader";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faUpload } from "@fortawesome/free-solid-svg-icons";
import { html, nothing, css } from "lit";
import BaseDialog, { showDialog } from "../components/dialogs/baseDialog.js";
import { createRef, ref } from "lit/directives/ref.js";

class UploadMetadataDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        sampleView: {},
        fileName: { state: true },
        lineCount: { state: true },
        headers: { state: true },
    };

    constructor() {
        super();

        /** @typer {import("./sampleView.js").default} */
        this.sampleView = null;

        this.dialogTitle = "Load Custom Metadata";

        /** @type {import("lit/directives/ref.js").Ref<HTMLInputElement>} */
        this._fileRef = createRef();

        this.fileName = null;
        this.lineCount = undefined;
        /** @type {string[] | null} */
        this.headers = null;
        this._dragOver = false;
    }

    static styles = [
        ...super.styles,
        css`
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

        const type = inferFileType(textContent, file.name);
        const data = read(textContent, { type, parse: "auto" });

        // compute simple statistics
        const lines = textContent.split(/\r?\n/).filter((l) => l.length > 0);
        const headerLine = lines.length > 0 ? lines[0] : "";
        const delimiter =
            type === "tsv" || headerLine.indexOf("\t") >= 0 ? "\t" : ",";
        const headers = headerLine.length
            ? headerLine.split(delimiter).map((h) => h.trim())
            : [];

        this.fileName = file.name;
        this.lineCount = lines.length;
        this.headers = headers;
        this.requestUpdate();

        // TODO: integrate with sampleView to ingest metadata (use this.sampleView)
        console.log("Parsed metadata", {
            file: file.name,
            headers,
            lines: this.lineCount,
            data,
        });
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

    renderBody() {
        return html`
            <p>Select a metadata file (CSV, TSV or JSON)</p>

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
            </div>

            ${this.fileName
                ? html`<div class="upload-stats">
                      <div><strong>File:</strong> ${this.fileName}</div>
                      <div><strong>Lines:</strong> ${this.lineCount}</div>
                      <div>
                          <strong>Columns:</strong> ${this.headers?.join(", ")}
                      </div>
                  </div>`
                : nothing}
        `;
    }

    renderButtons() {
        // Footer only needs a close/cancel button; file is processed inline
        return [this.makeCloseButton("Close")];
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
