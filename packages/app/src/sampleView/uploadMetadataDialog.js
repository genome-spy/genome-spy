import { read } from "vega-loader";
import { html } from "lit";
import BaseDialog, { showDialog } from "../components/dialogs/baseDialog.js";
import { createRef, ref } from "lit/directives/ref.js";

class UploadMetadataDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        sampleView: {},
    };

    constructor() {
        super();

        /** @typer {import("./sampleView.js").default} */
        this.sampleView = null;

        this.dialogTitle = "Load Custom Metadata";

        /** @type {import("lit/directives/ref.js").Ref<HTMLInputElement>} */
        this._fileRef = createRef();
    }

    async #onUpload() {
        const fileInput = this._fileRef.value;
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            return true;
        }
        const file = fileInput.files[0];
        const textContent = await readFileAsync(file);

        const data = read(textContent, {
            type: inferFileType(textContent, file.name),
            parse: "auto",
        });

        // TODO: integrate with sampleView to ingest metadata
        console.log("Uploaded metadata:", data);
    }

    renderBody() {
        return html`<p>Select a metadata file (CSV, TSV or JSON)</p>
            <input
                type="file"
                accept=".csv,.tsv,.json"
                ${ref(this._fileRef)}
            />`;
    }

    renderButtons() {
        return [
            this.makeCloseButton("Cancel"),
            this.makeButton("Upload", async () => {
                await this.#onUpload();
                return true;
            }),
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
