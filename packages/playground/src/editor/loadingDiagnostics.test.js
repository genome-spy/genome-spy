import { expect, test } from "vitest";
import { getLanguageService, TextDocument } from "vscode-json-languageservice";
import {
    indexSpecOrigins,
    resolveLoadingDiagnostics,
} from "./loadingDiagnostics.js";

/** @param {string} origin @param {Partial<import("@genome-spy/core/types/embedApi.js").DataLoadingEntry>} [extra] */
function failure(origin, extra = {}) {
    return {
        sourceId: origin,
        viewId: "view-0",
        viewPath: "root",
        status: /** @type {const} */ ("error"),
        message: "Cannot load data",
        errorPhase: /** @type {const} */ ("request"),
        origin,
        ...extra,
    };
}

/** @param {string} text @param {import("@genome-spy/core/types/embedApi.js").DataLoadingEntry[]} entries */
function resolve(text, entries) {
    const document = TextDocument.create(
        "inmemory://spec.json",
        "json",
        1,
        text
    );
    return resolveLoadingDiagnostics(
        getLanguageService({}).parseJSONDocument(document).root,
        entries
    );
}

test("indexes original identities and resolves duplicate URLs in root, nested, and side-input declarations", () => {
    const spec = {
        data: { url: "same.csv" },
        vconcat: [
            { data: { url: "same.csv" } },
            { transform: [{ from: { url: "same.csv" } }] },
        ],
        "a/~": { data: { url: "same.csv" } },
    };
    const origins = indexSpecOrigins(spec);
    const entries = [
        spec.data,
        spec.vconcat[0].data,
        spec.vconcat[1].transform[0].from,
        spec["a/~"].data,
    ].map((data) => failure(origins.get(data)));
    expect(entries.map((entry) => entry.origin)).toEqual([
        "/data",
        "/vconcat/0/data",
        "/vconcat/1/transform/0/from",
        "/a~1~0/data",
    ]);
    expect(origins.get({ url: "same.csv" })).toBeUndefined();
    for (const text of [JSON.stringify(spec), JSON.stringify(spec, null, 2)]) {
        const diagnostics = resolve(text, entries);
        expect(diagnostics).toHaveLength(4);
        expect(
            new Set(diagnostics.map((diagnostic) => diagnostic.from)).size
        ).toBe(4);
        expect(diagnostics.map(({ from, to }) => text.slice(from, to))).toEqual(
            Array(4).fill('"same.csv"')
        );
    }
});

test("uses configuration ranges for processing, URL lists, and ambiguous lazy failures", () => {
    const spec = {
        vconcat: [
            { data: { url: "valid.csv" } },
            { data: { url: ["a.csv", "b.csv"] } },
            { data: { lazy: { type: "bigwig", url: "data.bw" } } },
        ],
    };
    const text = JSON.stringify(spec);
    const diagnostics = resolve(text, [
        failure("/vconcat/0/data", { errorPhase: "processing" }),
        failure("/vconcat/1/data"),
        failure("/vconcat/2/data", { errorPhase: undefined }),
        failure("/missing"),
        failure("/data", { origin: undefined }),
        failure("/vconcat/0/data", { status: "complete" }),
    ]);
    expect(
        diagnostics.map(({ from, to }) => JSON.parse(text.slice(from, to)))
    ).toEqual(spec.vconcat.map((view) => view.data));
});
