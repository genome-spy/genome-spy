import { read } from "vega-loader";
import { faArrowLeft, faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { html, css } from "lit";
import BaseDialog, { showDialog } from "../components/dialogs/baseDialog.js";
import "../components/data-grid/dataGrid.js";
import "../components/uploadDropZone.js";

class UploadMetadataDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        sampleView: {},
        _fileName: { state: true },
        _parsedItems: { state: true },
        _page: { state: true },
    };

    constructor() {
        super();

        /** @typer {import("./sampleView.js").default} */
        this.sampleView = null;

        this.dialogTitle = "Load Custom Metadata";

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

            .upload-stats {
                margin-top: var(--gs-basic-spacing, 10px);
                font-size: 90%;
            }
        `,
    ];

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
        this.#changePage(1);
    }

    /**
     * @param {import("../components/uploadDropZone.js").FilesChosenEvent} e
     */
    async #onFilesChosen(e) {
        const file = e.detail.files[0];
        await this.#processFile(file);
    }

    #renderUpload() {
        return html` <p>
                Select a metadata file (CSV, TSV or JSON). The file must have a
                header row and a <em>sample</em> column that uniquely identifies
                each sample.
            </p>

            <gs-upload-drop-zone
                accept=".csv,.tsv,.json"
                @gs-files-chosen=${(
                    /** @type {import("../components/uploadDropZone.js").FilesChosenEvent} */ e
                ) => this.#onFilesChosen(e)}
            ></gs-upload-drop-zone>`;
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
