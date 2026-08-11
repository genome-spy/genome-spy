/**
 * Adapts vscode-json-languageservice results to CodeMirror extensions for
 * validation, completion, and schema-documentation hovers. CodeMirror provides
 * the editor UI but intentionally leaves these language features to extensions.
 *
 * The adapter design is based on CodeMirror's documented extension contracts:
 * https://codemirror.net/examples/lint/
 * https://codemirror.net/examples/autocompletion/
 * https://codemirror.net/docs/ref/#view.hoverTooltip
 */

import { pickedCompletion, snippet } from "@codemirror/autocomplete";
import { jsonLanguage } from "@codemirror/lang-json";
import { linter } from "@codemirror/lint";
import { Transaction } from "@codemirror/state";
import { hoverTooltip } from "@codemirror/view";
import { micromark } from "micromark";

// @ts-ignore
import JsonLanguageServiceWorker from "./jsonLanguageServiceWorker.js?worker";

export class JsonLanguageServiceClient {
    /** @type {Worker} */
    _worker;

    /** @type {number} */
    _nextRequestId = 1;

    /** @type {Map<number, { resolve: (value: any) => void, reject: (reason: Error) => void }>} */
    _requests = new Map();

    constructor() {
        this._worker = new JsonLanguageServiceWorker();
        this._worker.addEventListener("message", (event) => {
            const { id, result, error } = event.data;
            const request = this._requests.get(id);
            if (!request) {
                throw new Error("Unknown JSON language response: " + id);
            }

            this._requests.delete(id);
            if (error) {
                request.reject(new Error(error));
            } else {
                request.resolve(result);
            }
        });
    }

    /**
     * @param {"validate" | "complete" | "hover"} type
     * @param {string} text
     * @param {number} [offset]
     */
    request(type, text, offset = 0) {
        const id = this._nextRequestId++;

        return new Promise((resolve, reject) => {
            this._requests.set(id, { resolve, reject });
            this._worker.postMessage({ id, type, text, offset });
        });
    }

    dispose() {
        this._worker.terminate();
        for (const request of this._requests.values()) {
            request.reject(new Error("JSON language service was disposed"));
        }
        this._requests.clear();
    }
}

/**
 * @param {import("@codemirror/state").Text} document
 * @param {import("vscode-json-languageservice").Position} position
 */
function positionToOffset(document, position) {
    return document.line(position.line + 1).from + position.character;
}

/**
 * @param {number | undefined} severity
 * @returns {import("@codemirror/lint").Diagnostic["severity"]}
 */
function convertSeverity(severity) {
    switch (severity) {
        case 1:
            return "error";
        case 2:
            return "warning";
        case 3:
            return "info";
        case 4:
            return "hint";
        case undefined:
            return "error";
        default:
            throw new Error("Unknown diagnostic severity: " + severity);
    }
}

/**
 * @param {number | undefined} kind
 * @returns {string}
 */
function convertCompletionKind(kind) {
    switch (kind) {
        case 2:
            return "method";
        case 3:
        case 4:
            return "function";
        case 5:
        case 6:
            return "variable";
        case 7:
            return "class";
        case 8:
            return "interface";
        case 9:
            return "namespace";
        case 10:
        case 11:
            return "property";
        case 12:
        case 21:
            return "constant";
        case 13:
            return "enum";
        case 14:
            return "keyword";
        case 25:
            return "type";
        case 1:
        case 15:
        case 16:
        case 17:
        case 18:
        case 19:
        case 20:
        case 22:
        case 23:
        case 24:
        case undefined:
            return "text";
        default:
            throw new Error("Unknown completion kind: " + kind);
    }
}

/**
 * Converts the LSP snippet syntax used by the JSON language service to
 * CodeMirror's compatible braced placeholder syntax.
 *
 * @param {string} value
 */
export function convertSnippet(value) {
    const converted = value.replace(/\\\$|\$(\d+)/g, (match, index) =>
        index ? "${" + index + "}" : "$"
    );

    return converted.includes("${0}") ? converted : converted + "${0}";
}

/**
 * @param {string | import("vscode-json-languageservice").MarkupContent | undefined} documentation
 */
function getDocumentation(documentation) {
    if (typeof documentation === "string") {
        return documentation;
    } else if (documentation) {
        return documentation.value;
    } else {
        return undefined;
    }
}

/**
 * @param {import("vscode-json-languageservice").Hover["contents"]} contents
 */
function getHoverMarkdown(contents) {
    const entries = Array.isArray(contents) ? contents : [contents];

    return entries
        .map((entry) => {
            if (typeof entry === "string") {
                return entry;
            } else {
                return entry.value;
            }
        })
        .map((entry) =>
            entry
                .replace(/\\\r?\n/g, "\n")
                .replace(/\\([\\`*_[\]{}()#+\-.!])/g, "$1")
        )
        .join("\n\n");
}

/**
 * Renders the escaped Markdown returned by the JSON language service. Raw HTML
 * remains disabled so that schema descriptions cannot inject DOM content.
 *
 * @param {import("vscode-json-languageservice").Hover["contents"]} contents
 */
export function renderHoverMarkdown(contents) {
    return micromark(getHoverMarkdown(contents));
}

/**
 * @param {JsonLanguageServiceClient} client
 */
export function createJsonLanguageExtensions(client) {
    const validation = linter(async (view) => {
        const document = view.state.doc;
        /** @type {import("vscode-json-languageservice").Diagnostic[]} */
        const diagnostics = await client.request(
            "validate",
            document.toString()
        );

        return diagnostics.map((diagnostic) => ({
            from: positionToOffset(document, diagnostic.range.start),
            to: positionToOffset(document, diagnostic.range.end),
            message: getDocumentation(diagnostic.message) ?? "",
            severity: convertSeverity(diagnostic.severity),
            source: diagnostic.source,
        }));
    });

    const completion = jsonLanguage.data.of({
        autocomplete: async (
            /** @type {import("@codemirror/autocomplete").CompletionContext} */ context
        ) => {
            const document = context.state.doc;
            const offset =
                document.sliceString(context.pos, context.pos + 1) === '"'
                    ? context.pos + 1
                    : context.pos;
            /** @type {import("vscode-json-languageservice").CompletionList | null} */
            const result = await client.request(
                "complete",
                document.toString(),
                offset
            );

            if (!result || context.aborted || !result.items.length) {
                return null;
            }

            const firstEdit = result.items.find(
                (item) => item.textEdit
            )?.textEdit;
            if (!firstEdit || !("range" in firstEdit)) {
                throw new Error("JSON completion has no text edit range");
            }

            const from = positionToOffset(document, firstEdit.range.start);
            const to = positionToOffset(document, firstEdit.range.end);
            const replacedText = document.sliceString(from, to);
            const quotedValue =
                replacedText.startsWith('"') && replacedText.endsWith('"');
            const filterFrom = quotedValue ? from + 1 : from;
            const filterTo = quotedValue ? to - 1 : to;

            return {
                from: filterFrom,
                to: filterTo,
                options: result.items.map((item) => {
                    if (!item.textEdit || !("range" in item.textEdit)) {
                        throw new Error(
                            "JSON completion item has no text edit range"
                        );
                    }

                    const newText = item.textEdit.newText;
                    const itemFrom = positionToOffset(
                        document,
                        item.textEdit.range.start
                    );
                    const itemTo = positionToOffset(
                        document,
                        item.textEdit.range.end
                    );
                    const applySnippet =
                        item.insertTextFormat === 2
                            ? snippet(convertSnippet(newText))
                            : undefined;
                    const label =
                        quotedValue && /^".*"$/.test(item.label)
                            ? item.label.slice(1, -1)
                            : (item.filterText ?? item.label);

                    return {
                        label,
                        displayLabel: item.label,
                        detail: item.detail,
                        info: getDocumentation(item.documentation),
                        type: convertCompletionKind(item.kind),
                        sortText: item.sortText,
                        apply(
                            /** @type {import("@codemirror/view").EditorView} */ view,
                            /** @type {import("@codemirror/autocomplete").Completion} */ completion
                        ) {
                            if (applySnippet) {
                                applySnippet(
                                    view,
                                    completion,
                                    itemFrom,
                                    itemTo
                                );
                            } else {
                                view.dispatch({
                                    changes: {
                                        from: itemFrom,
                                        to: itemTo,
                                        insert: newText,
                                    },
                                    selection: {
                                        anchor: itemFrom + newText.length,
                                    },
                                    annotations: [
                                        pickedCompletion.of(completion),
                                        Transaction.userEvent.of(
                                            "input.complete"
                                        ),
                                    ],
                                });
                            }
                        },
                    };
                }),
                validFor: /^"?[\w$.-]*"?$/,
            };
        },
    });

    const hover = hoverTooltip(async (view, position) => {
        const document = view.state.doc;
        /** @type {import("vscode-json-languageservice").Hover | null} */
        const result = await client.request(
            "hover",
            document.toString(),
            position
        );

        if (!result) {
            return null;
        }

        const html = renderHoverMarkdown(result.contents);
        const from = result.range
            ? positionToOffset(document, result.range.start)
            : position;
        const to = result.range
            ? positionToOffset(document, result.range.end)
            : position;

        return {
            pos: from,
            end: to,
            above: true,
            create() {
                const dom = view.dom.ownerDocument.createElement("div");
                dom.className = "cm-json-schema-hover";
                dom.innerHTML = html;
                return { dom };
            },
        };
    });

    return [validation, completion, hover];
}
