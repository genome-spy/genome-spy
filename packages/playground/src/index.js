/* eslint-disable no-invalid-this */
import { html, render } from "lit";
import { ref, createRef } from "lit/directives/ref.js";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faColumns, faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { read } from "vega-loader";
import { embed, icon as genomeSpyIcon } from "@genome-spy/core";
import { debounce } from "@genome-spy/core/utils/debounce";
import defaultSpec from "./defaultspec.json.txt";
import "./codeEditor";
import "./playground.scss";

const STORAGE_KEY = "playgroundSpec";

const genomeSpyContainerRef = createRef();

/** @type {import("lit/directives/ref.js").Ref<import("./codeEditor").default>} */
const editorRef = createRef();

/** @type {any} TODO: Proper type */
let embedResult;

let storedSpec = window.localStorage.getItem(STORAGE_KEY) || defaultSpec;

let previousStringifiedSpec = "";

const layouts = ["stacked", "parallel", "full"];
let layout = layouts[0];

/** @type {Record<string, any>} */
const files = {};

/** @type {string} */
let currentTab;

function toggleLayout() {
    layout = layouts[(layouts.indexOf(layout) + 1) % layouts.length];
    renderLayout();
    window.dispatchEvent(new Event("resize"));
}

/**
 * @param {string} name
 */
function getNamedData(name) {
    return files[name]?.data;
}

async function update(force = false) {
    const value = editorRef.value?.value;
    window.localStorage.setItem(STORAGE_KEY, value);

    try {
        const parsedSpec = JSON.parse(value);

        // Don't update if the the new spec is equivalent
        const stringifiedSpec = JSON.stringify(parsedSpec);
        if (stringifiedSpec === previousStringifiedSpec && !force) {
            return;
        }

        previousStringifiedSpec = stringifiedSpec;

        if (embedResult) {
            embedResult.finalize();
        }

        // TODO: Fix possible race condition
        // eslint-disable-next-line require-atomic-updates
        embedResult = await embed(
            /** @type {HTMLElement} */ (genomeSpyContainerRef.value),
            parsedSpec,
            {
                namedDataProvider: getNamedData,
            }
        );
    } catch (e) {
        console.log(e);
    }
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

async function handleFiles(event) {
    const fileList = event.target.files;

    for (const file of fileList) {
        const textContent = await readFileAsync(file);

        const data = read(textContent, {
            type: inferFileType(textContent, file.name),
            parse: "auto",
        });

        files[file.name] = {
            metadata: file,
            data,
        };

        currentTab = file.name;
    }

    renderLayout();
    update(true);
}

/**
 * @param {UIEvent} event
 */
function changeTab(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const name = target.parentElement.dataset.name;
    currentTab = name;

    event.preventDefault();
    renderLayout();
}

const toolbarTemplate = () => html`
    <div class="toolbar">
        <img
            title="GenomeSpy"
            alt="GenomeSpy"
            src="${genomeSpyIcon}"
            class="genome-spy-icon"
        />
        <span class="title">
            <span>GenomeSpy Playground</span>
        </span>
        <button @click=${toggleLayout}>
            ${icon(faColumns).node[0]}
            <span>Toggle layout</span>
        </button>
        <span class="spacer"></span>
        <a href="https://genomespy.app/docs/" target="_blank"
            >${icon(faQuestionCircle).node[0]} <span>Docs</span></a
        >
    </div>
`;

const singleFileTemplate = (f) => {
    const cols = Object.keys(f.data[0]);
    const rows = f.data.slice(0, 30);

    const alignments = cols.map(
        (col) =>
            "text-align: " +
            (typeof f.data[0][col] === "number" ? "right" : "left")
    );

    return html`
        <table class="data-sample-table">
            <thead>
                <tr>
                    ${cols.map(
                        (c, i) => html` <th style=${alignments[i]}>${c}</th> `
                    )}
                </tr>
            </thead>
            <tbody>
                ${rows.map(
                    (row) => html`
                        <tr>
                            ${cols.map(
                                (c, i) =>
                                    html`
                                        <td style=${alignments[i]}>
                                            ${row[c]}
                                        </td>
                                    `
                            )}
                        </tr>
                    `
                )}
                ${rows.length < f.data.length
                    ? html`
                          <tr>
                              ${cols.map(
                                  (c, i) =>
                                      html`
                                          <td style=${alignments[i]}>...</td>
                                      `
                              )}
                          </tr>
                      `
                    : ``}
            </tbody>
        </table>
    `;
};

const fileTemplate = () => html`
    <ul class="tabs">
        ${Object.keys(files).map(
            (name) =>
                html`
                    <li
                        data-name=${name}
                        class=${name == currentTab ? "selected" : ""}
                    >
                        <a href="#" @click=${changeTab}>${name}</a>
                    </li>
                `
        )}
        <li class=${currentTab === undefined ? "selected" : ""}>
            <a href="#" @click=${changeTab}>Add new files</a>
        </li>
        <li style="flex-grow: 1"></li>
    </ul>

    <div class="tab-pages">
        ${Object.keys(files).map(
            (name) => html`
                <div class=${name == currentTab ? "selected" : ""}>
                    ${singleFileTemplate(files[name])}
                </div>
            `
        )}

        <div class=${currentTab === undefined ? "selected" : ""}>
            <form class="upload-form">
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
                    The added file becomes a named datasource, which can be
                    accessed as follows:
                </p>

                <pre>
"data": {
    "name": "filename.csv"
}
</pre
                >

                <p>
                    N.B. All data processing takes place in your web browser.
                    Nothing is uploaded anywhere.
                </p>
            </form>
        </div>
    </div>
`;

const debouncedUpdate = debounce(() => update(), 500, false);

const layoutTemplate = () => html`
    <section id="playground-layout" class="${layout}">
        ${toolbarTemplate()}
        <section id="editor-pane">
            <code-editor
                ${ref(editorRef)}
                @change=${debouncedUpdate}
                .value=${storedSpec}
            ></code-editor>
        </section>
        <section id="genome-spy-pane">
            <div ${ref(genomeSpyContainerRef)}></div>
        </section>
        <section id="file-pane">${fileTemplate()}</section>
    </section>
`;

function renderLayout() {
    render(layoutTemplate(), document.body);
}

renderLayout();

update();
