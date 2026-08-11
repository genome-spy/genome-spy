# Playground editor

This directory contains the CodeMirror-based JSON editor used by the
playground.

CodeMirror provides editing, JSON syntax highlighting, and the extension APIs.
It does not include JSON Schema validation or schema-aware completion by
default, so `jsonLanguageService.js` adapts `vscode-json-languageservice` to
CodeMirror's lint, completion, and hover interfaces.

`jsonLanguageServiceWorker.js` runs the language service with GenomeSpy's
generated JSON Schema in a web worker. Keeping schema parsing and queries off
the UI thread prevents validation and completion from interrupting editing.

## Design sources

The bridge and worker protocol are GenomeSpy-specific and do not copy upstream
implementation code. Their design is based on these public APIs and examples:

- [CodeMirror lint example](https://codemirror.net/examples/lint/)
- [CodeMirror autocompletion example](https://codemirror.net/examples/autocompletion/)
- [CodeMirror `hoverTooltip` API](https://codemirror.net/docs/ref/#view.hoverTooltip)
- [Microsoft's VS Code JSON language service](https://github.com/microsoft/vscode-json-languageservice)

CodeMirror and `vscode-json-languageservice` are both distributed under the MIT
License.
