import { LitElement, nothing } from "lit";
import { basicSetup, EditorView } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { forceLinting } from "@codemirror/lint";
import {
    createJsonLanguageExtensions,
    JsonLanguageServiceClient,
    refreshJsonDiagnostics,
} from "./jsonLanguageService.js";

const editorTheme = EditorView.theme({
    "&": {
        height: "100%",
        minHeight: "0",
        fontFamily: "var(--playground-monospace)",
        fontSize: "12px",
    },
    ".cm-scroller": {
        overflow: "auto",
        fontFamily: "var(--playground-monospace)",
    },
    ".cm-gutters": {
        backgroundColor: "rgba(0, 0, 0, 0.04)",
        borderRight: "1px solid rgba(0, 0, 0, 0.08)",
    },
    ".cm-tooltip-autocomplete > ul": {
        fontFamily: "var(--playground-monospace)",
    },
    ".cm-json-schema-hover": {
        maxWidth: "520px",
        padding: "6px 8px",
        fontFamily: "var(--playground-font-family)",
        fontSize: "12px",
        lineHeight: "1.4",
    },
    ".cm-json-schema-hover p": {
        margin: "0 0 0.6em",
    },
    ".cm-json-schema-hover p:last-child": {
        marginBottom: "0",
    },
    ".cm-json-schema-hover ul": {
        margin: "0.4em 0 0.6em",
        paddingLeft: "1.5em",
    },
    ".cm-json-schema-hover code": {
        fontFamily: "var(--playground-monospace)",
    },
});

export default class CodeEditor extends LitElement {
    /** @type {EditorView} */
    _editor;

    /** @type {string} */
    _initialValue = "";

    /** @type {JsonLanguageServiceClient} */
    _languageService;

    /** @type {Map<string, import("@genome-spy/core/types/embedApi.js").DataLoadingEntry>} */
    _loadingEntries = new Map();

    /** @type {string | undefined} Semantic identity of the authored embed document. */
    _loadingSpec;

    _loadingRevision = 0;

    /** @type {() => void} */
    _stopLoading = () => {};

    clearDataLoading() {
        this._stopLoading();
        this._loadingEntries = new Map();
        this._loadingSpec = undefined;
        this._refreshLoadingDiagnostics();
    }

    /**
     * @param {import("@genome-spy/core/types/embedApi.js").EmbedResult} api
     * @param {string} specText Original editor document, before injected base URLs/datasets.
     */
    observeDataLoading(api, specText) {
        this.clearDataLoading();
        this._loadingSpec = JSON.stringify(JSON.parse(specText));
        const entries = this._loadingEntries;
        this._stopLoading = api.dataLoading.subscribe((change) => {
            if (entries !== this._loadingEntries) return;
            if (change.type === "update")
                entries.set(change.entry.sourceId, change.entry);
            else entries.delete(change.sourceId);
            this._refreshLoadingDiagnostics();
        });
        for (const entry of api.dataLoading.getSnapshot())
            entries.set(entry.sourceId, entry);
        this._refreshLoadingDiagnostics();
    }

    /** @param {string} text */
    _getLoadingEntries(text) {
        try {
            if (JSON.stringify(JSON.parse(text)) === this._loadingSpec)
                return Array.from(this._loadingEntries.values());
        } catch {
            // Invalid editor text has no matching runtime specification.
        }
        return [];
    }

    _refreshLoadingDiagnostics() {
        this._loadingRevision++;
        if (this._editor) {
            this._editor.dispatch({ effects: refreshJsonDiagnostics.of(null) });
            forceLinting(this._editor);
        }
    }

    /**
     * @param {string} value
     */
    set value(value) {
        if (this._editor) {
            const currentValue = this._editor.state.doc.toString();
            if (value !== currentValue) {
                this._editor.dispatch({
                    changes: {
                        from: 0,
                        to: currentValue.length,
                        insert: value,
                    },
                });
            }
        } else {
            this._initialValue = value;
        }
    }

    get value() {
        return this._editor?.state.doc.toString() ?? this._initialValue;
    }

    createRenderRoot() {
        // No shadow DOM, please. Styles don't get through.
        return this;
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopLoading();
        this._editor?.destroy();
        this._languageService?.dispose();
    }

    render() {
        return nothing;
    }

    firstUpdated() {
        this._languageService = new JsonLanguageServiceClient();
        const state = EditorState.create({
            doc: this._initialValue,
            extensions: [
                basicSetup,
                json(),
                EditorState.tabSize.of(2),
                keymap.of([indentWithTab]),
                editorTheme,
                createJsonLanguageExtensions(this._languageService, {
                    getLoadingEntries: (text) => this._getLoadingEntries(text),
                    getLoadingRevision: () => this._loadingRevision,
                }),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        if (
                            this._loadingEntries
                                .values()
                                .some((entry) => entry.status === "error")
                        ) {
                            queueMicrotask(() => forceLinting(this._editor));
                        }
                        this.dispatchEvent(
                            new CustomEvent("change", { detail: {} })
                        );
                    }
                }),
            ],
        });

        this._editor = new EditorView({
            parent: this,
            // The split-panel shadow root is not the style root for this
            // light-DOM editor, so CodeMirror must mount styles on the page.
            root: this.ownerDocument,
            state,
        });
    }
}

customElements.define("code-editor", CodeEditor);
