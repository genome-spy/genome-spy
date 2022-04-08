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

/** @type {import("@genome-spy/core/embedApi.js").EmbedResult} */
let embedResult;

let storedSpec = window.localStorage.getItem(STORAGE_KEY) || defaultSpec;

let previousStringifiedSpec = "";

const layouts = ["stacked", "parallel", "full"];
let layout = layouts[0];

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
                uri: "http://myserver/foo-schema.json", // id of the first schema
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
                .value=${storedSpec}
            ></code-editor>
        </section>
        <section id="genome-spy-pane">
            <div ${ref(genomeSpyContainerRef)}></div>
        </section>
        <section id="file-pane">
            <file-pane @upload=${update} .files=${files}></file-pane>
        </section>
    </section>
`;

function renderLayout() {
    render(layoutTemplate(), document.body);
}

renderLayout();

update();
