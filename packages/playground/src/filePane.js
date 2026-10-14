import { html, LitElement, css, nothing } from "lit";
import { playgroundComponentStyles } from "./componentStyles.js";
import { map } from "lit/directives/map.js";
import { read } from "vega-loader";

/**
 * @typedef {Record<string, any>} Datum
 * @typedef {{ metadata: File, data: any }} FileEntry
 */

/** Dataset tabs, previews, and local file upload. */
export default class FilePane extends LitElement {
    static properties = {
        missingFiles: { type: Set, attribute: false },
        files: { attribute: false },
    };

    /** @type {string | undefined} */
    #currentTab;

    static styles = [
        playgroundComponentStyles,
        css`
            :host {
                display: flex;
                flex-direction: column;
                height: 100%;
                min-height: 0;
                background: var(--playground-surface);
            }

            .tabs {
                display: flex;
                flex-shrink: 0;
                overflow-x: auto;
                border-bottom: 1px solid var(--playground-divider);
                background: var(--playground-panel);
                padding: 4px 4px 0;
                gap: 4px;
            }

            [role="tab"] {
                padding: 4px 8px;
                white-space: nowrap;
                cursor: pointer;
                border: none;
                border-bottom: 2px solid transparent;
                border-radius: var(--playground-radius) var(--playground-radius)
                    0 0;
                background: transparent;
                color: var(--playground-muted);

                &:hover {
                    background: var(--playground-hover);
                }

                &[aria-selected="true"] {
                    background: var(--playground-surface);
                    color: var(--playground-accent-text);
                    border-bottom-color: var(--playground-accent);
                }

                &:focus-visible {
                    outline-offset: -2px;
                }
            }

            [role="tabpanel"] {
                flex: 1;
                overflow: auto;
                padding: var(--playground-spacing);
            }

            .upload-form {
                display: grid;
                justify-items: start;
                gap: var(--playground-spacing);
                margin-top: var(--playground-spacing);

                p,
                pre {
                    margin: 0;
                }

                p {
                    color: var(--playground-muted);
                }
            }

            pre {
                padding: var(--playground-spacing);
                background: var(--playground-panel);
                border-radius: var(--playground-radius);
            }

            pre,
            .missing-files ul {
                font-family: var(--playground-monospace);
                font-size: var(--playground-font-small);
            }

            table {
                border-collapse: separate;
                border-spacing: 0;
                font-size: var(--playground-font-small);
            }

            td,
            th {
                padding: 4px 8px;
                max-width: 15em;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                text-align: left;
                border-bottom: 1px solid var(--playground-divider);

                &.number {
                    text-align: right;
                    font-variant-numeric: tabular-nums;
                }

                &:hover {
                    overflow: visible;
                    background: var(--playground-hover);
                }
            }

            th {
                position: sticky;
                top: 0;
                background: var(--playground-panel);
                font-weight: 600;
            }
        `,
    ];

    constructor() {
        super();
        /** @type {Record<string, FileEntry>} */
        this.files = {};
        /** @type {Set<string>} */
        this.missingFiles = new Set();
    }

    /** Show the upload prompt when a spec needs data files. */
    showUpload() {
        this.#selectTab(undefined);
    }

    render() {
        const names = [...Object.keys(this.files), undefined];
        const selectedIndex = names.indexOf(this.#currentTab);
        return html`
            <div
                class="tabs"
                role="tablist"
                aria-label="Datasets"
                @keydown=${this.#handleTabKeydown}
            >
                ${names.map(
                    (name, index) => html`
                        <button
                            role="tab"
                            id=${"tab-" + index}
                            aria-controls="tab-panel"
                            aria-selected=${index === selectedIndex}
                            tabindex=${index === selectedIndex ? 0 : -1}
                            @click=${() => this.#selectTab(name)}
                        >
                            ${name ?? "Add new files"}
                        </button>
                    `
                )}
            </div>
            <div
                role="tabpanel"
                id="tab-panel"
                aria-labelledby=${"tab-" + selectedIndex}
                tabindex="0"
            >
                ${
                    this.#currentTab === undefined
                        ? html` ${
                              this.missingFiles.size
                                  ? html` <div
                                        class="notice warning missing-files"
                                    >
                                        <p>Please add the following files:</p>
                                        <ul>
                                            ${map(this.missingFiles, (name) => html`<li>${name}</li>`)}
                                        </ul>
                                    </div>`
                                  : nothing
                          }
                          ${this.#renderUploadForm()}`
                        : makeDataTable(this.files[this.#currentTab].data)
                }
            </div>
        `;
    }

    /** @param {string | undefined} name */
    #selectTab(name) {
        this.#currentTab = name;
        this.requestUpdate();
    }

    /** @param {KeyboardEvent} event */
    async #handleTabKeydown(event) {
        const names = [...Object.keys(this.files), undefined];
        const index = names.indexOf(this.#currentTab);
        let next;
        switch (event.key) {
            case "ArrowRight":
                next = (index + 1) % names.length;
                break;
            case "ArrowLeft":
                next = (index + names.length - 1) % names.length;
                break;
            case "Home":
                next = 0;
                break;
            case "End":
                next = names.length - 1;
                break;
            default:
                return;
        }
        event.preventDefault();
        this.#selectTab(names[next]);
        await this.updateComplete;
        /** @type {HTMLElement} */ (
            this.renderRoot.querySelector('[aria-selected="true"]')
        ).focus();
    }

    #renderUploadForm() {
        return html`
            <div class="upload-form">
                <input
                    type="file"
                    multiple
                    accept=".csv,.tsv,.txt,.json"
                    id="fileInput"
                    hidden
                    @change=${this._handleFiles}
                />
                <button
                    type="button"
                    class="button primary"
                    @click=${() =>
                        /** @type {HTMLInputElement} */ (
                            this.renderRoot.querySelector("#fileInput")
                        ).click()}
                >
                    Choose files
                </button>
                <p>
                    The added file becomes a named datasource, which can be
                    accessed as follows:
                </p>
                <pre>
"data": {
    "name": "filename.csv"
}</pre>
                <p>
                    All data processing takes place in your web browser. Nothing
                    is uploaded anywhere.
                </p>
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
}

customElements.define("file-pane", FilePane);

/**
 *
 * @param {Datum[]} data
 */
function makeDataTable(data) {
    const cols = Object.keys(data[0]);
    const rows = data.slice(0, 30);

    const alignments = cols.map((col) =>
        typeof data[0][col] === "number" ? "number" : ""
    );

    const makeRow = (/** @type {Datum} */ row) => html`
        <tr>
            ${cols.map(
                (c, i) => html`<td class=${alignments[i]}>${row[c]}</td> `
            )}
        </tr>
    `;

    const makeEllipsis = () => html`
        <tr>
            ${cols.map((c, i) => html`<td class=${alignments[i]}>...</td> `)}
        </tr>
    `;

    const makeHead = () => html`
        <tr>
            ${cols.map((c, i) => html`<th class=${alignments[i]}>${c}</th> `)}
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
