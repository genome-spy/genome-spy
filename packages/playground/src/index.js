import { html, nothing, render } from "lit";
import { ref, createRef } from "lit/directives/ref.js";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faColumns,
    faFolderOpen,
    faQuestionCircle,
    faIndent,
} from "@fortawesome/free-solid-svg-icons";
import favIcon from "@genome-spy/core/img/genomespy-favicon.svg";
import { embed, icon as genomeSpyIcon } from "@genome-spy/core";
import { debounce } from "@genome-spy/core/utils/debounce.js";
import inferSpecBaseUrl, {
    getCuratedExampleBaseUrl,
} from "@genome-spy/core/utils/inferSpecBaseUrl.js";
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
const EXAMPLE_CATALOG_URL = "example-catalog.json";
const genomeSpyContainerRef = createRef();
const exampleSearchRef = createRef();

/** @type {import("lit/directives/ref.js").Ref<import("./codeEditor.js").default>} */
const editorRef = createRef();

/** @type {Record<string, import("./filePane.js").FileEntry>} */
const files = {};

/** @type {Set<string>} */
let missingFiles = new Set();

/** @type {import("@genome-spy/core/types/embedApi.js").EmbedResult} */
let embedResult;

let previousStringifiedSpec = "";
let suppressNextEditorChange = false;

const layouts = ["vertical", "horizontal"];
let layout = layouts[0];

/** @type {string | undefined} */
let inheritedBaseUrl;

let visTitle = "";
let effectiveBaseUrlLabel = "";
let isExamplePickerOpen = false;
let exampleSearch = "";
let isExampleCatalogLoading = false;
let exampleCatalogError = "";

/** @type {Promise<void> | undefined} */
let exampleCatalogPromise;

/**
 * @typedef {{
 *   id: string;
 *   title: string;
 *   description: string;
 *   sourceGroup: string;
 *   sourceLabel: string;
 *   category: string;
 *   specPath: string;
 *   specUrl: string;
 *   sourceMode: string;
 * }} ExampleCatalogEntry
 */

/** @type {ExampleCatalogEntry[]} */
let exampleCatalog = [];

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

async function ensureExampleCatalogLoaded() {
    if (exampleCatalog.length > 0) {
        return Promise.resolve();
    }

    if (exampleCatalogPromise) {
        return exampleCatalogPromise;
    }

    isExampleCatalogLoading = true;
    exampleCatalogError = "";
    renderLayout();

    exampleCatalogPromise = fetch(EXAMPLE_CATALOG_URL)
        .then((response) => {
            if (!response.ok) {
                throw new Error(
                    `Could not load example catalog: ${response.status} ${response.statusText}`
                );
            }

            return response.json();
        })
        .then((catalog) => {
            exampleCatalog = catalog;
        })
        .catch((error) => {
            exampleCatalogError = error.message;
        })
        .finally(() => {
            isExampleCatalogLoading = false;
            exampleCatalogPromise = undefined;
            renderLayout();
        });

    return exampleCatalogPromise;
}

function toggleLayout() {
    layout = layouts[(layouts.indexOf(layout) + 1) % layouts.length];
    renderLayout();
    window.dispatchEvent(new Event("resize"));
}

function openExamplePicker() {
    isExamplePickerOpen = true;
    exampleSearch = "";
    renderLayout();
    void ensureExampleCatalogLoaded().then(() => {
        requestAnimationFrame(() => {
            exampleSearchRef.value?.focus();
        });
    });
}

function closeExamplePicker() {
    isExamplePickerOpen = false;
    renderLayout();
}

/**
 * @param {string} specText
 */
function setEditorSpec(specText) {
    suppressNextEditorChange = true;
    editorRef.value.value = specText;
    void update(true);
}

function clearSpecQueryParam() {
    const nextUrl = new URL(window.location.href);
    if (!nextUrl.searchParams.has("spec")) {
        return;
    }

    nextUrl.searchParams.delete("spec");
    window.history.replaceState({}, "", nextUrl);
}

/**
 * @param {string} specUrl
 */
async function openSpec(specUrl) {
    const specText = await loadSpecFromUrl(specUrl);
    const nextUrl = new URL(window.location.href);

    nextUrl.searchParams.set("spec", specUrl);
    window.history.pushState({}, "", nextUrl);

    setEditorSpec(specText);
}

/**
 * @param {ExampleCatalogEntry} entry
 */
async function openCatalogEntry(entry) {
    closeExamplePicker();
    await openSpec(entry.specUrl);
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
    const sourceBaseUrl = inferSpecBaseUrl(specUrl.href);

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

    return !getCuratedExampleBaseUrl(specUrl.href);
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

function getFilteredCatalogEntries() {
    const query = exampleSearch.trim().toLowerCase();
    if (!query) {
        return exampleCatalog;
    }

    return exampleCatalog.filter(
        (entry) =>
            entry.title.toLowerCase().includes(query) ||
            entry.category.toLowerCase().includes(query) ||
            entry.specPath.toLowerCase().includes(query)
    );
}

function getCatalogGroups() {
    /** @type {Map<string, ExampleCatalogEntry[]>} */
    const groups = new Map();

    for (const entry of getFilteredCatalogEntries()) {
        const bucket = groups.get(entry.sourceLabel) || [];
        bucket.push(entry);
        groups.set(entry.sourceLabel, bucket);
    }

    return Array.from(groups.entries());
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

/**
 * @param {string} groupLabel
 * @param {ExampleCatalogEntry[]} entries
 */
const exampleGroupTemplate = (groupLabel, entries) => html`
    <section class="example-picker__group">
        <h3>${groupLabel}</h3>
        <div class="example-picker__entries">
            ${entries.map(
                (entry) => html`
                    <button
                        class="example-picker__entry"
                        @click=${() => openCatalogEntry(entry)}
                    >
                        <span class="example-picker__entry-title"
                            >${entry.title}</span
                        >
                        <span class="example-picker__entry-meta"
                            >${entry.category}</span
                        >
                    </button>
                `
            )}
        </div>
    </section>
`;

const examplePickerTemplate = () => {
    if (!isExamplePickerOpen) {
        return nothing;
    }

    const groups = getCatalogGroups();

    return html`
        <div class="example-picker-backdrop" @click=${closeExamplePicker}>
            <aside
                class="example-picker"
                @click=${(event) => event.stopPropagation()}
            >
                <div class="example-picker__header">
                    <div>
                        <h2>Examples</h2>
                        <p>Curated shared examples from the monorepo.</p>
                    </div>
                    <button class="tool-button" @click=${closeExamplePicker}>
                        <span>Close</span>
                    </button>
                </div>
                <input
                    ${ref(exampleSearchRef)}
                    class="example-picker__search"
                    type="search"
                    placeholder="Search examples"
                    .value=${exampleSearch}
                    @input=${(event) => {
                        exampleSearch = event.target.value;
                        renderLayout();
                    }}
                />
                <div class="example-picker__content">
                    ${isExampleCatalogLoading
                        ? html`<p class="example-picker__status">
                              Loading example catalog...
                          </p>`
                        : exampleCatalogError
                          ? html`<p class="example-picker__status error">
                                ${exampleCatalogError}
                            </p>`
                          : groups.length === 0
                            ? html`<p class="example-picker__status">
                                  No examples matched the current search.
                              </p>`
                            : groups.map(([label, entries]) =>
                                  exampleGroupTemplate(label, entries)
                              )}
                </div>
            </aside>
        </div>
    `;
};

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
        <button @click=${openExamplePicker} class="tool-button">
            ${icon(faFolderOpen).node[0]}
            <span>Examples</span>
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

function handleEditorChange() {
    if (suppressNextEditorChange) {
        suppressNextEditorChange = false;
        return;
    }

    clearSpecQueryParam();
    debouncedUpdate();
}

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
                    @change=${handleEditorChange}
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
    ${examplePickerTemplate()}
`;

function renderLayout() {
    render(layoutTemplate(), document.body);
}

setFavicon(favIcon);
renderLayout();

loadSpec().then(setEditorSpec);

window.addEventListener("popstate", () => {
    loadSpec().then(setEditorSpec);
});

window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isExamplePickerOpen) {
        closeExamplePicker();
    }
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
