import { html, render } from "lit";
import { ref, createRef } from "lit/directives/ref.js";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faColumns, faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { embed, icon as genomeSpyIcon } from "@genome-spy/core";
import { debounce } from "@genome-spy/core/utils/debounce";
import defaultSpec from "./defaultspec.json?raw";

import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
// Available after the core package has been built
import schema from "@genome-spy/core/schema.json";
import "@genome-spy/core/style.css";

import packageJson from "../package.json";
import "./codeEditor";
import "./filePane";
import "./playground.scss";
import addMarkdownProps from "./markdownProps";

registerJsonSchema();

const STORAGE_KEY = "playgroundSpec";

const genomeSpyContainerRef = createRef();

/** @type {import("lit/directives/ref.js").Ref<import("./codeEditor").default>} */
const editorRef = createRef();

/** @type {Record<string, import("./filePane").FileEntry>} */
const files = {};

/** @type {Set<string>} */
let missingFiles = new Set();

/** @type {import("@genome-spy/core/embedApi.js").EmbedResult} */
let embedResult;

let previousStringifiedSpec = "";

const layouts = ["stacked", "parallel", "full"];
let layout = layouts[0];

/** @type {string} */
let baseUrl;

async function loadSpec() {
    const urlParams = new URLSearchParams(window.location.search);
    const specUrl = urlParams.get("spec");
    if (specUrl) {
        // TODO: Error handling
        const response = await fetch(specUrl);
        baseUrl = specUrl.match(/.*\//)[0];

        return response.text();
    }
    const storedSpec = window.localStorage.getItem(STORAGE_KEY);
    const spec = storedSpec?.length > 0 ? storedSpec : defaultSpec;
    console.log("Jeejee", spec);
    return spec;
}

function toggleLayout() {
    layout = layouts[(layouts.indexOf(layout) + 1) % layouts.length];
    renderLayout();
    window.dispatchEvent(new Event("resize"));
}

function registerJsonSchema() {
    addMarkdownProps(schema);
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        validate: true,
        schemas: [
            {
                uri: "https://unpkg.com/@genome-spy/core/dist/schema.json", // id of the first schema
                fileMatch: ["*"], // associate with our model
                schema,
            },
        ],
    });
}

/**
 * @param {string} name
 */
function getNamedData(name) {
    let file = files[name];
    if (!file) {
        missingFiles.add(name);
    }

    return file?.data;
}

async function update(force = false) {
    missingFiles = new Set();

    if (baseUrl && window.location.search) {
        window.history.replaceState(null, "", window.location.pathname);
    }

    const value = editorRef.value?.value;
    if (value) {
        window.localStorage.setItem(STORAGE_KEY, value);
    }

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

        if (baseUrl && !parsedSpec.baseUrl) {
            parsedSpec.baseUrl = baseUrl;
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

        // To ensure that missing files are shown in file pane
        renderLayout();
    } catch (e) {
        console.log(e);
    }
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
        <a
            class="version"
            href="https://github.com/genome-spy/genome-spy/releases/tag/v${packageJson.version}"
            >v${packageJson.version}</a
        >
        <a href="https://genomespy.app/docs/" target="_blank"
            >${icon(faQuestionCircle).node[0]} <span>Docs</span></a
        >
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
            ></code-editor>
        </section>
        <section id="genome-spy-pane">
            <div ${ref(genomeSpyContainerRef)}></div>
        </section>
        <section id="file-pane">
            <file-pane
                @upload=${update}
                .files=${files}
                .missingFiles=${missingFiles}
            ></file-pane>
        </section>
    </section>
`;

function renderLayout() {
    render(layoutTemplate(), document.body);
}

renderLayout();

loadSpec().then((spec) => {
    editorRef.value.value = spec;
});
