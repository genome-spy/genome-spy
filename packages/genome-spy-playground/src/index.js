import { html, render } from 'lit-html';

import JsonLint from 'jsonlint-mod';

import CodeMirror from 'codemirror/lib/codemirror.js';
import 'codemirror/mode/javascript/javascript.js';
//import 'codemirror/keymap/vim.js';
import 'codemirror/addon/lint/lint';
import 'codemirror/addon/lint/json-lint.js';
import 'codemirror/addon/edit/matchbrackets.js';

import 'codemirror/lib/codemirror.css';
import 'codemirror/addon/lint/lint.css';

import 'codemirror/theme/neo.css';

import './playground.scss';
import './codemirror-theme.scss';

import { GenomeSpy } from 'genome-spy';

window.jsonlint = JsonLint;

let genomeSpy;
let codeMirror;
let x = 123;

let layout = "parallel";

function toggleLayout() {
    layout = layout == "parallel" ? "stacked" : "parallel";
    renderLayout();
    window.dispatchEvent(new Event('resize'));
}


// https://codeburst.io/throttling-and-debouncing-in-javascript-b01cad5c8edf
const debounce = (func, delay) => {
    let inDebounce;
    return function () {
        const context = this;
        const args = arguments;
        clearTimeout(inDebounce);
        inDebounce = setTimeout(() => func.apply(context, args), delay);
    }
}

function update() {
    const value = codeMirror.getValue();
    try {
        const spec = JSON.parse(value);

        if (genomeSpy) {
            genomeSpy.destroy();
        }

        genomeSpy = new GenomeSpy(document.querySelector(".genome-spy-container"), spec);
        genomeSpy.launch();

    } catch (e) {
        console.log(e);
        //alert(`Invalid JSON: ${e.message}`);
    }
    
}

const toolbarTemplate = () => html`
    <div class="toolbar">
        <span class="title">GenomeSpy Playground</span>
        <button @click=${toggleLayout}>
            Toggle layout
        </button>
    </div>
`;


const layoutTemplate = () => html`
    <div class="playground-container ${layout}">
        ${toolbarTemplate()}
        <div class="editor-container">
            <textarea class="editor">xyz</textarea>
        </div>
        <div class="genome-spy-container ">
            
        </div>
    </div>
`;

function renderLayout() {
    render(layoutTemplate(), document.body);
}

renderLayout();

codeMirror = CodeMirror.fromTextArea(
    document.querySelector(".editor-container .editor"),
    {
        lineNumbers: true,
        mode: "application/json",
        lineWrapping: true,
        gutters: ["CodeMirror-lint-markers"],
        lint: true,
        matchBrackets: true,
        indentUnit: 4,
        indentWithTabs: false
        //keyMap: "vim"
    });

codeMirror.setSize("100%", "100%");

const debouncedUpdate = debounce(update, 400);

codeMirror.on("change", debouncedUpdate);


