import { LitElement, nothing } from "lit";
import { basicSetup, EditorView } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import {
    createJsonLanguageExtensions,
    JsonLanguageServiceClient,
} from "./jsonLanguageService.js";

const editorTheme = EditorView.theme({
    "&": {
        height: "100%",
        minHeight: "0",
        fontFamily: "'Source Code Pro', monospace",
        fontSize: "12px",
    },
    ".cm-scroller": {
        overflow: "auto",
    },
    ".cm-gutters": {
        backgroundColor: "rgba(0, 0, 0, 0.04)",
        borderRight: "1px solid rgba(0, 0, 0, 0.08)",
    },
    ".cm-tooltip-autocomplete > ul": {
        fontFamily: "'Source Code Pro', monospace",
    },
    ".cm-json-schema-hover": {
        maxWidth: "520px",
        padding: "6px 8px",
        fontFamily: "Lato, sans-serif",
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
        fontFamily: "'Source Code Pro', monospace",
    },
});

export default class CodeEditor extends LitElement {
    /** @type {EditorView} */
    _editor;

    /** @type {string} */
    _initialValue = "";

    /** @type {JsonLanguageServiceClient} */
    _languageService;

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
                createJsonLanguageExtensions(this._languageService),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
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
