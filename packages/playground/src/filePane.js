import { html, LitElement, nothing } from "lit";
import { map } from "lit/directives/map.js";
import { read } from "vega-loader";

/**
 * @typedef {Record<string, any>} Datum
 * @typedef {{ metadata: File, data: any }} FileEntry
 */

/**
 *
 */
export default class FilePane extends LitElement {
    static properties = {
        missingFiles: { type: Set, attribute: false },
    };

    /** @type {string | undefined} */
    #currentTab;

    /** @type {Record<string, FileEntry>} */
    files;

    constructor() {
        super();

        /** @type {Set<String>} */
        this.missingFiles = new Set();
    }

    createRenderRoot() {
        // No shadow DOM, please. Styles don't get through.
        return this;
    }

    render() {
        return html`
            <ul class="tabs">
                ${Object.keys(this.files).map(
                    (name) => html`
                        <li
                            data-name=${name}
                            class=${name == this.#currentTab ? "selected" : ""}
                        >
                            <a
                                href="#"
                                @click=${(/** @type {UIEvent} */ event) =>
                                    this._changeTab(event)}
                                >${name}</a
                            >
                        </li>
                    `
                )}
                <li class=${this.#currentTab === undefined ? "selected" : ""}>
                    <a
                        href="#"
                        @click=${(/** @type {UIEvent} */ event) =>
                            this._changeTab(event)}
                        >Add new files</a
                    >
                </li>
                <li style="flex-grow: 1"></li>
            </ul>

            <div class="tab-pages">
                ${Object.keys(this.files).map(
                    (name) => html`
                        <div
                            class=${name == this.#currentTab ? "selected" : ""}
                        >
                            ${makeDataTable(this.files[name].data)}
                        </div>
                    `
                )}

                <div class=${this.#currentTab === undefined ? "selected" : ""}>
                    ${this.missingFiles.size
                        ? html`<div class="missing-files">
                              <p>Please add the following files:</p>
                              <ul>
                                  ${map(
                                      this.missingFiles,
                                      (name) => html`<li>${name}</li>`
                                  )}
                              </ul>
                          </div>`
                        : nothing}
                    ${makeUploadForm((event) => this._handleFiles(event))}
                </div>
            </div>
        `;
    }

    /**
     *
     * @param {InputEvent} event
     */
    async _handleFiles(event) {
        const target = /** @type {HTMLInputElement} */ (event.target);
        const fileList = target.files;

        for (const file of fileList) {
            const textContent = await readFileAsync(file);

            const data = read(textContent, {
                type: inferFileType(textContent, file.name),
                parse: "auto",
            });

            this.files[file.name] = {
                metadata: file,
                data,
            };

            this.#currentTab = file.name;
        }

        this.requestUpdate();
        this.dispatchEvent(new CustomEvent("upload", { detail: {} }));
    }

    /**
     * @param {UIEvent} event
     */
    _changeTab(event) {
        const target = /** @type {HTMLElement} */ (event.target);
        const name = target.parentElement.dataset.name;
        this.#currentTab = name;

        event.preventDefault();
        this.requestUpdate();
    }
}

customElements.define("file-pane", FilePane);

// Utils

/**
 *
 * @param {(event: InputEvent) => void} handleFiles
 * @returns
 */
function makeUploadForm(handleFiles) {
    return html` <form class="upload-form">
        <input
            type="file"
            multiple
            accept=".csv,.tsv,.txt,.json"
            id="fileInput"
            @change=${handleFiles}
            style="display:none"
        />
        <div id="upload-button-wrapper">
            <button
                class="btn"
                @click=${(/** @type {UIEvent} */ e) => {
                    document.getElementById("fileInput").click();
                    e.preventDefault();
                    e.stopPropagation();
                }}
            >
                Choose files
            </button>
        </div>

        <p>
            The added file becomes a named datasource, which can be accessed as
            follows:
        </p>

        <pre>
"data": {
    "name": "filename.csv"
}
</pre
        >

        <p>
            N.B. All data processing takes place in your web browser. Nothing is
            uploaded anywhere.
        </p>
    </form>`;
}

/**
 *
 * @param {Datum[]} data
 */
function makeDataTable(data) {
    const cols = Object.keys(data[0]);
    const rows = data.slice(0, 30);

    const alignments = cols.map(
        (col) =>
            "text-align: " +
            (typeof data[0][col] === "number" ? "right" : "left")
    );

    const makeRow = (/** @type {Datum[]} */ row) => html`
        <tr>
            ${cols.map(
                (c, i) => html`<td style=${alignments[i]}>${row[c]}</td> `
            )}
        </tr>
    `;

    const makeEllipsis = () => html`
        <tr>
            ${cols.map((c, i) => html`<td style=${alignments[i]}>...</td> `)}
        </tr>
    `;

    const makeHead = () => html`
        <tr>
            ${cols.map((c, i) => html`<th style=${alignments[i]}>${c}</th> `)}
        </tr>
    `;

    return html`
        <table class="data-sample-table">
            <thead>
                ${makeHead()}
            </thead>
            <tbody>
                ${rows.map(makeRow)}
                ${rows.length < data.length ? makeEllipsis() : ``}
            </tbody>
        </table>
    `;
}

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
