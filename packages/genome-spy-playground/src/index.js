import { html, render } from "lit-html";

import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faColumns,
    faQuestionCircle,
    faDna
} from "@fortawesome/free-solid-svg-icons";

import JsonLint from "jsonlint-mod";

import { read } from "vega-loader";

import defaultSpec from "./defaultspec.json.txt";

import CodeMirror from "codemirror/lib/codemirror.js";
import "codemirror/mode/javascript/javascript.js";
//import 'codemirror/keymap/vim.js';
import "codemirror/addon/lint/lint";
import "codemirror/addon/lint/json-lint.js";
import "codemirror/addon/edit/matchbrackets.js";

import "codemirror/lib/codemirror.css";
import "codemirror/addon/lint/lint.css";

import "codemirror/theme/neo.css";

import "./playground.scss";
import "./codemirror-theme.scss";

import { GenomeSpy } from "genome-spy";

window.jsonlint = JsonLint;

const STORAGE_KEY = "playgroundSpec";

let genomeSpy;
let codeMirror;
let storedSpec = window.localStorage.getItem(STORAGE_KEY) || defaultSpec;

let previousStringifiedSpec = "";

const layouts = ["stacked", "parallel", "full"];
let layout = layouts[0];

const files = {};

/** @type {string} */
let currentTab;

function toggleLayout() {
    layout = layouts[(layouts.indexOf(layout) + 1) % layouts.length];
    renderLayout();
    window.dispatchEvent(new Event("resize"));
}

// https://codeburst.io/throttling-and-debouncing-in-javascript-b01cad5c8edf
const debounce = (func, delay) => {
    let inDebounce;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(inDebounce);
        inDebounce = setTimeout(() => func.apply(context, args), delay);
    };
};

function getNamedData(name) {
    const file = files[name];
    if (file) {
        return file.data;
    }
}

function update(force = false) {
    const value = codeMirror.getValue();
    window.localStorage.setItem(STORAGE_KEY, value);

    try {
        const parsedSpec = JSON.parse(value);

        // Don't update if the the new spec is equivalent
        const stringifiedSpec = JSON.stringify(parsedSpec);
        if (stringifiedSpec === previousStringifiedSpec && !force) {
            return;
        }

        previousStringifiedSpec = stringifiedSpec;

        if (genomeSpy) {
            genomeSpy.destroy();
        }

        genomeSpy = new GenomeSpy(
            document.querySelector("#genome-spy-pane"),
            parsedSpec
        );
        genomeSpy.registerNamedDataProvider(getNamedData);
        genomeSpy.launch();
    } catch (e) {
        console.log(e);
    }
}

// https://simon-schraeder.de/posts/filereader-async/
function readFileAsync(file) {
    return new Promise((resolve, reject) => {
        let reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

/**
 * @param {string} contents
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
            parse: "auto"
        });

        files[file.name] = {
            metadata: file,
            data
        };

        currentTab = file.name;
    }

    renderLayout();
    update(true);
}

function changeTab(event) {
    const name = event.target.parentElement.dataset.name;
    currentTab = name;

    event.preventDefault();
    renderLayout();
}

const toolbarTemplate = () => html`
    <div class="toolbar">
        <span class="title">
            ${icon(faDna).node[0]}
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

const singleFileTemplate = f => {
    const cols = Object.keys(f.data[0]);
    const rows = f.data.slice(0, 30);

    const alignments = cols.map(
        col =>
            "text-align: " +
            (typeof f.data[0][col] === "number" ? "right" : "left")
    );

    return html`
        <table class="data-sample-table">
            <thead>
                <tr>
                    ${cols.map(
                        (c, i) =>
                            html`
                                <th style=${alignments[i]}>${c}</th>
                            `
                    )}
                </tr>
            </thead>
            <tbody>
                ${rows.map(
                    row => html`
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
            name =>
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
            <a href="#" @click=${changeTab}>Add new file</a>
        </li>
        <li style="flex-grow: 1"></li>
    </ul>

    <div class="tab-pages">
        ${Object.keys(files).map(
            name => html`
                <div class=${name == currentTab ? "selected" : ""}>
                    ${singleFileTemplate(files[name])}
                </div>
            `
        )}

        <div class=${currentTab === undefined ? "selected" : ""}>
            <form>
                <input type="file" id="fileInput" @change=${handleFiles} />
            </form>
        </div>
    </div>
`;

const layoutTemplate = () => html`
    <section id="playground-layout" class="${layout}">
        ${toolbarTemplate()}
        <section id="editor-pane">
            <textarea class="editor">${storedSpec}</textarea>
        </section>
        <section id="genome-spy-pane"></section>
        <section id="file-pane">
            ${fileTemplate()}
        </section>
    </section>
`;

function renderLayout() {
    render(layoutTemplate(), document.body);
}

renderLayout();

codeMirror = CodeMirror.fromTextArea(
    document.querySelector("#editor-pane .editor"),
    {
        lineNumbers: true,
        mode: "application/json",
        lineWrapping: true,
        gutters: ["CodeMirror-lint-markers"],
        lint: true,
        matchBrackets: true,
        indentUnit: 2,
        indentWithTabs: false
        //keyMap: "vim"
    }
);

codeMirror.setSize("100%", "100%");

const debouncedUpdate = debounce(() => update(), 500);

codeMirror.on("change", debouncedUpdate);

update();
