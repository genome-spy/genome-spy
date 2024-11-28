/**
 * Loosely based on: https://github.com/rodydavis/lit-code-editor
 */

import { LitElement, nothing } from "lit";

import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import "monaco-editor/esm/vs/language/json/monaco.contribution.js";
import "monaco-editor/esm/vs/editor/browser/coreCommands.js";
import "monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js";
import "monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor.js";
import "monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js";
import "monaco-editor/esm/vs/editor/contrib/hover/browser/hover.js";
import "monaco-editor/esm/vs/editor/contrib/find/browser/findController.js";

// @ts-ignore
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";

// @ts-ignore
self.MonacoEnvironment = {
    /** @type {(_: any, label: string) => any} */
    getWorker(_, label) {
        if (label === "json") {
            return new JsonWorker();
        }
        throw new Error("Unsupported language: " + label);
    },
};

export default class CodeEditor extends LitElement {
    /** @type {monaco.editor.IStandaloneCodeEditor} */
    _editor;

    /** @type {string} */
    _initialValue;

    constructor() {
        super();
    }

    /**
     * @param {string} value
     */
    set value(value) {
        if (this._editor) {
            this._editor.setValue(value);
        } else {
            this._initialValue = value;
        }
    }

    get value() {
        return this._editor?.getValue() ?? this._initialValue;
    }

    createRenderRoot() {
        // No shadow DOM, please. Styles don't get through.
        return this;
    }

    disconnectedCallback() {
        this._editor?.dispose();
        this._editor?.getModel()?.dispose();
    }

    render() {
        return nothing;
    }

    firstUpdated() {
        this._editor = monaco.editor.create(this, {
            value: this._initialValue,
            language: "json",
            minimap: { enabled: false },
            fontFamily: "'Source Code Pro', monospace",
            fontSize: 12,
            tabSize: 2,
            autoIndent: "advanced",
        });

        this._editor.getModel().onDidChangeContent(() => {
            this.dispatchEvent(new CustomEvent("change", { detail: {} }));
        });

        const resizeObserver = new ResizeObserver((_entries) => {
            this._editor.layout();
        });
        resizeObserver.observe(this);
    }
}

customElements.define("code-editor", CodeEditor);
