import { html, nothing, render } from "lit";
import { ref, createRef } from "lit/directives/ref.js";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faColumns,
    faQuestionCircle,
    faIndent,
} from "@fortawesome/free-solid-svg-icons";
import favIcon from "@genome-spy/core/img/genomespy-favicon.svg";
import { embed, icon as genomeSpyIcon } from "@genome-spy/core";
import { debounce } from "@genome-spy/core/utils/debounce.js";
import defaultSpec from "./defaultspec.json?raw";

import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
// Available after the core package has been built
import schema from "@genome-spy/core/schema.json";

import packageJson from "../package.json";
import "./splitPanel.js";
import "./codeEditor.js";
import "./filePane.js";
import "./playground.scss";
import addMarkdownProps from "./markdownProps.js";
import { asArray } from "@genome-spy/core/utils/arrayUtils.js";

registerJsonSchema();

const STORAGE_KEY = "playgroundSpec";
const SHARED_EXAMPLE_PREFIXES = [
    "/docs/examples/",
    "/examples/core/",
    "/examples/docs/",
    "/examples/app/",
];

const genomeSpyContainerRef = createRef();

/** @type {import("lit/directives/ref.js").Ref<import("./codeEditor.js").default>} */
const editorRef = createRef();

/** @type {Record<string, import("./filePane.js").FileEntry>} */
const files = {};

/** @type {Set<string>} */
let missingFiles = new Set();

/** @type {import("@genome-spy/core/types/embedApi.js").EmbedResult} */
let embedResult;

let previousStringifiedSpec = "";

const layouts = ["vertical", "horizontal"];
let layout = layouts[0];

/** @type {string | undefined} */
let inheritedBaseUrl;

let visTitle = "";
let effectiveBaseUrlLabel = "";

async function loadSpec() {
    const urlParams = new URLSearchParams(window.location.search);
    const specParam = urlParams.get("spec");
    if (specParam) {
        return loadSpecFromUrl(specParam);
    }

    const storedState = loadStoredState();
    inheritedBaseUrl = storedState?.inheritedBaseUrl;

    return storedState?.specText?.length > 0
        ? storedState.specText
        : defaultSpec;
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
 * @typedef {{ specText: string, inheritedBaseUrl?: string }} StoredState
 */

/**
 * @returns {StoredState | undefined}
 */
function loadStoredState() {
    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    if (!storedValue) {
        return undefined;
    }

    try {
        const parsed = JSON.parse(storedValue);
        if (typeof parsed === "string") {
            return {
                specText: parsed,
            };
        }

        if (typeof parsed?.specText === "string") {
            return parsed;
        }
    } catch {
        return {
            specText: storedValue,
        };
    }
}

/**
 * @param {string} specText
 */
function storeState(specText) {
    window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
            specText,
            inheritedBaseUrl,
        })
    );
}

/**
 * @param {string} specParam
 */
async function loadSpecFromUrl(specParam) {
    const specUrl = new URL(specParam, window.location.href);
    const response = await fetch(specUrl);
    const specText = await response.text();
    const sourceBaseUrl = new URL("./", specUrl).href;

    if (shouldInjectBaseUrl(specUrl)) {
        inheritedBaseUrl = undefined;
        return injectBaseUrl(specText, sourceBaseUrl);
    }

    inheritedBaseUrl = sourceBaseUrl;
    return specText;
}

/**
 * @param {URL} specUrl
 */
function shouldInjectBaseUrl(specUrl) {
    if (!specUrl.pathname.startsWith("/examples/")) {
        return false;
    }

    return !SHARED_EXAMPLE_PREFIXES.some((prefix) =>
        specUrl.pathname.startsWith(prefix)
    );
}

/**
 * @param {string} specText
 * @param {string} baseUrl
 */
function injectBaseUrl(specText, baseUrl) {
    const parsedSpec = JSON.parse(specText);
    parsedSpec.baseUrl ??= baseUrl;

    return JSON.stringify(parsedSpec, null, 2) + "\n";
}

/**
 * @param {string} url
 */
function formatUrlForDisplay(url) {
    if (/^(?:[a-z]+:)?\/\//i.test(url)) {
        const sameOriginPrefix = window.location.origin;
        if (url.startsWith(sameOriginPrefix)) {
            return url.slice(sameOriginPrefix.length);
        }
    }

    return url;
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

async function formatWithPrettier() {
    const [prettier, prettierPluginBabel, prettierPluginEstree] =
        await Promise.all([
            import("prettier/standalone"),
            import("prettier/plugins/babel"),
            import("prettier/plugins/estree"),
        ]);

    const formatted = await prettier.format(editorRef.value.value, {
        parser: "json",
        // @ts-ignore
        plugins: [prettierPluginBabel, prettierPluginEstree],
    });
    editorRef.value.value = formatted;
}

function clearBaseUrl() {
    const value = editorRef.value?.value;
    if (!value) {
        return;
    }

    const parsedSpec = JSON.parse(value);
    if (parsedSpec.baseUrl) {
        delete parsedSpec.baseUrl;
        editorRef.value.value = JSON.stringify(parsedSpec, null, 2) + "\n";
    } else {
        inheritedBaseUrl = undefined;
    }

    update(true);
}

async function update(force = false) {
    missingFiles = new Set();

    const value = editorRef.value?.value;
    if (value) {
        storeState(value);
    }

    try {
        const parsedSpec = JSON.parse(value);
        const explicitBaseUrl = parsedSpec.baseUrl;
        const effectiveBaseUrl = explicitBaseUrl || inheritedBaseUrl;

        // Don't update if the the new spec is equivalent
        if (effectiveBaseUrl && !explicitBaseUrl) {
            parsedSpec.baseUrl = effectiveBaseUrl;
        }

        const stringifiedSpec = JSON.stringify(parsedSpec);
        if (stringifiedSpec === previousStringifiedSpec && !force) {
            return;
        }

        previousStringifiedSpec = stringifiedSpec;

        if (embedResult) {
            embedResult.finalize();
        }

        visTitle = asArray(parsedSpec.description)?.[0];
        effectiveBaseUrlLabel = parsedSpec.baseUrl
            ? "Spec base: " + formatUrlForDisplay(parsedSpec.baseUrl)
            : inheritedBaseUrl
              ? "Source base: " + formatUrlForDisplay(inheritedBaseUrl)
              : "";
        renderLayout();

        // TODO: Fix possible race condition
        // eslint-disable-next-line require-atomic-updates
        embedResult = await embed(
            /** @type {HTMLElement} */ (genomeSpyContainerRef.value),
            parsedSpec,
            {
                namedDataProvider: getNamedData,
                powerPreference: "high-performance",
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
        <a
            href="https://genomespy.app/"
            target="_blank"
            class="genome-spy-icon"
        >
            <img title="GenomeSpy" alt="GenomeSpy" src="${genomeSpyIcon}" />
        </a>
        <span class="title">
            <span>GenomeSpy Playground</span>
        </span>
        <button @click=${toggleLayout} class="tool-button hide-mobile">
            ${icon(faColumns).node[0]}
            <span>Toggle layout</span>
        </button>
        <button
            @click=${() => formatWithPrettier()}
            class="tool-button hide-mobile"
        >
            ${icon(faIndent).node[0]}
            <span>Format code</span>
        </button>
        ${effectiveBaseUrlLabel
            ? html`
                  <span class="base-url-indicator hide-mobile">
                      <span>${effectiveBaseUrlLabel}</span>
                      <button @click=${clearBaseUrl} class="tool-button">
                          <span>Clear base</span>
                      </button>
                  </span>
              `
            : nothing}
        <span class="vis-title">
            <span class="hide-mobile">${visTitle}</span>
        </span>
        <a
            class="version tool-button"
            href="https://github.com/genome-spy/genome-spy/releases/tag/v${packageJson.version}"
            >v${packageJson.version}</a
        >
        <a
            href="https://genomespy.app/docs/"
            target="_blank"
            class="tool-button hide-mobile"
            >${icon(faQuestionCircle).node[0]} <span>Docs</span></a
        >
    </div>
`;

const debouncedUpdate = debounce(() => update(), 500, false);

const layoutTemplate = () => html`
    <section id="playground-layout" class="${layout}">
        ${toolbarTemplate()}
        <split-panel
            .orientation=${layout}
            .reverse=${layout != "vertical"}
            id="main-panel"
        >
            <div
                id="genome-spy-container"
                ${ref(genomeSpyContainerRef)}
                slot="1"
            ></div>
            <split-panel
                .orientation=${layout == "vertical" ? "horizontal" : "vertical"}
                slot="2"
                id="editor-and-others"
            >
                <code-editor
                    style="position: absolute; inset: 0"
                    ${ref(editorRef)}
                    @change=${debouncedUpdate}
                    slot="1"
                ></code-editor>
                <section id="file-pane" slot="2">
                    <file-pane
                        @upload=${update}
                        .files=${files}
                        .missingFiles=${missingFiles}
                    ></file-pane>
                </section>
            </split-panel>
        </split-panel>
    </section>
`;

function renderLayout() {
    render(layoutTemplate(), document.body);
}

setFavicon(favIcon);
renderLayout();

loadSpec().then((spec) => {
    editorRef.value.value = spec;
});

/**
 * https://spemer.com/articles/set-favicon-with-javascript.html
 *
 * @param {string} favImg
 */
function setFavicon(favImg) {
    const headTitle = document.querySelector("head");
    const setFavicon = document.createElement("link");
    setFavicon.setAttribute("rel", "shortcut icon");
    setFavicon.setAttribute("href", favImg);
    headTitle.appendChild(setFavicon);
}
