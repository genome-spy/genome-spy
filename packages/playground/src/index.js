import { html, render } from "lit";
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
import "./baseUrlNotice.js";
import "./codeEditor.js";
import "./examplePicker.js";
import "./filePane.js";
import "./playground.scss";
import addMarkdownProps from "./markdownProps.js";
import { asArray } from "@genome-spy/core/utils/arrayUtils.js";

registerJsonSchema();

const STORAGE_KEY = "playgroundSpec";
const EXAMPLE_CATALOG_URL = "example-catalog.json";
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
let suppressNextEditorChange = false;

const layouts = ["vertical", "horizontal"];
let layout = layouts[0];

/** @type {string | undefined} */
let inheritedBaseUrl;

let visTitle = "";
/** @type {{ summary: string, detail: string, canClear: boolean } | null} */
let effectiveBaseUrlInfo = null;
let isExamplePickerOpen = false;
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
 *   screenshotPath: string | null;
 *   screenshotUrl: string | null;
 *   sourceMode: string;
 * }} ExampleCatalogEntry
 */

/** @type {ExampleCatalogEntry[]} */
let exampleCatalog = [];

function shouldAutoOpenExamplePicker() {
    return window.location.hash === "#examples";
}

/**
 * @param {boolean} open
 */
function setExamplePickerHash(open) {
    const url = new URL(window.location.href);
    const nextHash = open ? "#examples" : "";
    if (url.hash === nextHash) {
        return;
    }

    url.hash = nextHash;
    window.history.replaceState({}, "", formatPlaygroundUrl(url));
}

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
    setExamplePickerHash(true);
    renderLayout();
    void ensureExampleCatalogLoaded();
}

function closeExamplePicker() {
    isExamplePickerOpen = false;
    setExamplePickerHash(false);
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

/**
 * @param {string} value
 */
function encodeSpecQueryValue(value) {
    return encodeURIComponent(value)
        .replace(/%2F/giu, "/")
        .replace(/%3A/giu, ":");
}

/**
 * @param {URL} url
 */
function formatPlaygroundUrl(url) {
    /** @type {string[]} */
    const queryParts = [];

    for (const [key, value] of url.searchParams.entries()) {
        const encodedKey = encodeURIComponent(key);
        const encodedValue =
            key === "spec"
                ? encodeSpecQueryValue(value)
                : encodeURIComponent(value);
        queryParts.push(`${encodedKey}=${encodedValue}`);
    }

    const query = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
    return `${url.pathname}${query}${url.hash}`;
}

function clearSpecQueryParam() {
    const nextUrl = new URL(window.location.href);
    if (!nextUrl.searchParams.has("spec")) {
        return;
    }

    nextUrl.searchParams.delete("spec");
    window.history.replaceState({}, "", formatPlaygroundUrl(nextUrl));
}

/**
 * @param {string} specUrl
 */
async function openSpec(specUrl) {
    const specText = await loadSpecFromUrl(specUrl);
    const nextUrl = new URL(window.location.href);

    nextUrl.searchParams.set("spec", specUrl);
    window.history.pushState({}, "", formatPlaygroundUrl(nextUrl));

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
            {
                uri: "https://cdn.jsdelivr.net/npm/@genome-spy/core/dist/schema.json", // id of the first schema
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

/**
 * @param {string | undefined} explicitBaseUrl
 * @param {string | undefined} sourceBaseUrl
 */
function getEffectiveBaseUrlInfo(explicitBaseUrl, sourceBaseUrl) {
    if (explicitBaseUrl) {
        return {
            summary: `Explicit baseUrl: ${formatUrlForDisplay(explicitBaseUrl)}`,
            detail: "Relative data and import URLs resolve against this base URL.",
            canClear: true,
        };
    } else if (sourceBaseUrl) {
        return {
            summary: `Inherited baseUrl: ${formatUrlForDisplay(sourceBaseUrl)}`,
            detail: "Relative data and import URLs resolve against this base URL until you clear or replace it.",
            canClear: true,
        };
    } else {
        return null;
    }
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
        const explicitBaseUrl =
            typeof parsedSpec.baseUrl === "string"
                ? parsedSpec.baseUrl
                : undefined;
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
        effectiveBaseUrlInfo = getEffectiveBaseUrlInfo(
            explicitBaseUrl,
            inheritedBaseUrl
        );
        renderLayout();

        // TODO: Fix possible race condition
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
        <a
            href="https://genomespy.app/docs/"
            target="_blank"
            class="tool-button hide-mobile"
            >${icon(faQuestionCircle).node[0]} <span>Docs</span></a
        >
        <span class="vis-title">
            <span class="hide-mobile">${visTitle}</span>
        </span>
        <a
            class="version tool-button"
            href="https://github.com/genome-spy/genome-spy/releases/tag/v${packageJson.version}"
            >v${packageJson.version}</a
        >
        <button @click=${openExamplePicker} class="tool-button">
            ${icon(faFolderOpen).node[0]}
            <span>Examples</span>
        </button>
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
        <gs-example-picker
            ?open=${isExamplePickerOpen}
            .loading=${isExampleCatalogLoading}
            .error=${exampleCatalogError}
            .entries=${exampleCatalog}
            @close=${closeExamplePicker}
            @open-example=${(
                /** @type {CustomEvent<{ entry: ExampleCatalogEntry }>} */ event
            ) => openCatalogEntry(event.detail.entry)}
        ></gs-example-picker>
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
                <section id="editor-pane" slot="1">
                    ${effectiveBaseUrlInfo
                        ? html`
                              <base-url-notice
                                  .info=${effectiveBaseUrlInfo}
                                  @clear=${clearBaseUrl}
                              ></base-url-notice>
                          `
                        : null}
                    <code-editor
                        ${ref(editorRef)}
                        @change=${handleEditorChange}
                    ></code-editor>
                </section>
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

function syncExamplePickerFromUrl() {
    if (shouldAutoOpenExamplePicker()) {
        openExamplePicker();
    } else if (isExamplePickerOpen) {
        closeExamplePicker();
    }
}

setFavicon(favIcon);
renderLayout();
syncExamplePickerFromUrl();

loadSpec().then(setEditorSpec);

window.addEventListener("popstate", () => {
    syncExamplePickerFromUrl();
    loadSpec().then(setEditorSpec);
});

window.addEventListener("hashchange", () => {
    syncExamplePickerFromUrl();
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
