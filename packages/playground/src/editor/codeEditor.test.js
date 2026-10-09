// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { forEachDiagnostic } from "@codemirror/lint";

const validation = vi.hoisted(() => ({
    holdNext: false,
    release: /** @type {(() => void) | undefined} */ (undefined),
}));

// Exercise the real CodeMirror adapter/editor with worker responses computed from
// a real JSON AST. A small local schema avoids fetching the generated schema.
vi.mock("./jsonLanguageService.js", async (importOriginal) => {
    const actual = /** @type {typeof import("./jsonLanguageService.js")} */ (
        await importOriginal()
    );
    const { getLanguageService, TextDocument } =
        await import("vscode-json-languageservice");
    const { resolveLoadingDiagnostics } =
        await import("./loadingDiagnostics.js");
    return {
        ...actual,
        JsonLanguageServiceClient: class {
            /**
             * @param {string} type
             * @param {string} text
             * @param {number} offset
             * @param {import("@genome-spy/core/types/embedApi.js").DataLoadingEntry[]} entries
             */
            async request(type, text, offset, entries = []) {
                if (validation.holdNext) {
                    validation.holdNext = false;
                    await new Promise((resolve) => {
                        validation.release = () => resolve(undefined);
                    });
                }
                const service = getLanguageService({});
                const document = TextDocument.create(
                    "inmemory://spec.json",
                    "json",
                    1,
                    text
                );
                const json = service.parseJSONDocument(document);
                const schema = await service.doValidation(
                    document,
                    json,
                    {},
                    {
                        type: "object",
                        properties: { width: { type: "number" } },
                    }
                );
                return schema.concat(
                    resolveLoadingDiagnostics(json.root, entries).map(
                        ({ from, to, message }) => ({
                            range: {
                                start: document.positionAt(from),
                                end: document.positionAt(to),
                            },
                            message,
                            severity: /** @type {const} */ (1),
                            source: "GenomeSpy data loading",
                        })
                    )
                );
            }
            dispose() {}
        },
    };
});

import CodeEditor from "./codeEditor.js";

/** @type {CodeEditor | undefined} */
let editor;
afterEach(() => {
    editor?.remove();
    editor = undefined;
});

function createApi() {
    /** @type {Set<(change: import("@genome-spy/core/types/embedApi.js").DataLoadingChange) => void>} */
    const listeners = new Set();
    const entry = {
        sourceId: "source-0",
        viewId: "view-0",
        viewPath: "root",
        origin: "/data",
        status: /** @type {const} */ ("error"),
        errorPhase: /** @type {const} */ ("request"),
        message: "Missing CSV",
    };
    const api =
        /** @type {import("@genome-spy/core/types/embedApi.js").EmbedResult} */ (
            /** @type {unknown} */ ({
                dataLoading: {
                    getSnapshot: () => [entry],
                    subscribe: (
                        /** @type {(change: import("@genome-spy/core/types/embedApi.js").DataLoadingChange) => void} */ listener
                    ) => {
                        listeners.add(listener);
                        return () => {
                            listeners.delete(listener);
                        };
                    },
                },
            })
        );
    /** @param {import("@genome-spy/core/types/embedApi.js").DataLoadingChange} change */
    const emit = (change) => {
        for (const listener of listeners) listener(change);
    };
    return { api, entry, listeners, emit };
}

function diagnostics() {
    /** @type {import("@codemirror/lint").Diagnostic[]} */
    const result = [];
    forEachDiagnostic(editor._editor.state, (diagnostic, from, to) =>
        result.push({ ...diagnostic, from, to })
    );
    return result;
}
function loadingDiagnostics() {
    return diagnostics().filter(
        (diagnostic) => diagnostic.source === "GenomeSpy data loading"
    );
}

test("keeps loading diagnostics with schema errors and follows the matching document and embed", async () => {
    const spec = { width: "bad", data: { url: "missing.csv" }, mark: "point" };
    editor = new CodeEditor();
    editor.value = JSON.stringify(spec);
    document.body.appendChild(editor);
    await editor.updateComplete;
    const first = createApi();
    editor.observeDataLoading(first.api, editor.value);
    await vi.waitFor(() => expect(diagnostics()).toHaveLength(2));
    expect(loadingDiagnostics()[0].message).toBe("Missing CSV");

    editor.value = JSON.stringify(spec, null, 2);
    await vi.waitFor(() =>
        expect(loadingDiagnostics()[0]?.from).toBe(
            editor.value.indexOf('"missing.csv"')
        )
    );
    expect(diagnostics()).toHaveLength(2);

    editor.value = "{";
    await vi.waitFor(() => expect(loadingDiagnostics()).toEqual([]));
    spec.data.url = "replacement.csv";
    editor.value = JSON.stringify(spec);
    first.emit({
        type: "update",
        entry: { ...first.entry, message: "Old embed result" },
    });
    await vi.waitFor(() => expect(loadingDiagnostics()).toEqual([]));

    const oldListener = first.listeners.values().next().value;
    const second = createApi();
    editor.observeDataLoading(second.api, editor.value);
    expect(first.listeners.size).toBe(0);
    oldListener({
        type: "update",
        entry: { ...first.entry, message: "Stale callback" },
    });
    await vi.waitFor(() =>
        expect(loadingDiagnostics()[0]?.message).toBe("Missing CSV")
    );
    expect(
        editor.value.slice(
            loadingDiagnostics()[0].from,
            loadingDiagnostics()[0].to
        )
    ).toBe('"replacement.csv"');

    // An older validation response must not reinstate a cleared error on the same document.
    validation.holdNext = true;
    second.emit({ type: "update", entry: second.entry });
    second.emit({
        type: "update",
        entry: { ...second.entry, status: "loading" },
    });
    await vi.waitFor(() => expect(loadingDiagnostics()).toEqual([]));
    validation.release();
    await vi.waitFor(() => expect(diagnostics()).toHaveLength(1));

    second.emit({ type: "update", entry: second.entry });
    await vi.waitFor(() => expect(loadingDiagnostics()).toHaveLength(1));
    second.emit({ type: "remove", sourceId: second.entry.sourceId });
    await vi.waitFor(() => expect(loadingDiagnostics()).toEqual([]));
    editor.remove();
    expect(second.listeners.size).toBe(0);
});
