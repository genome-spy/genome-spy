import { expect, test } from "vitest";
import { createTestEmbed } from "@genome-spy/core/view/embedTestUtils.js";
import { createDatumSearch } from "@genome-spy/core/search";
import { searchViewDatumsTool } from "./searchViewDatumsTool.js";
import { ToolCallRejectionError } from "./agentToolErrors.js";

// Use a real Core capability so the adapter's bounded, serializable tool result
// is verified independently of its implementation and without exposing internals.
async function setup() {
    const fixture = await createTestEmbed({
        name: "gene-track",
        datasets: {
            genes: Array.from({ length: 12 }, (_, index) => ({
                symbol: "TP53",
                alias: "p53",
                transcript: index,
                nested: { note: "original" },
            })),
        },
        data: { name: "genes" },
        mark: "point",
        encoding: { search: [{ field: "symbol" }, { field: "alias" }] },
    });
    const runtime = {
        agentApi: /** @type {import("@genome-spy/app/agentApi").AgentApi} */ ({
            getViewApi: () => fixture.views,
            getDatumSearch: () => createDatumSearch(fixture.views),
        }),
    };
    return { ...fixture, runtime };
}
const selector = { scope: [], view: "gene-track" };

test("uses host lookup with a ten-row bound, detached records, and serializable coverage", async () => {
    const { runtime, views } = await setup();
    const { content, text } = searchViewDatumsTool(runtime, {
        selector,
        query: "tp53",
        field: "symbol",
        mode: "exact",
    });
    expect(text).toContain("More loaded matches exist");
    expect(content).toMatchObject({
        kind: "datum_lookup_result",
        selector,
        count: 10,
        truncated: true,
        sources: [
            {
                selector,
                coverage: "loaded",
                readiness: "ready",
                scan: "partial",
            },
        ],
    });
    const result = /** @type {any} */ (content);
    result.matches[0].nested.note = "changed";
    expect(
        views.root().data.read({ scope: "all", limit: 1 }).rows[0].nested
    ).toEqual({ note: "original" });
    expect(result.matches[0]).not.toHaveProperty("__uniqueId");
    expect(JSON.stringify(result)).not.toContain("getDomain");
    expect(result.sources[0]).not.toHaveProperty("view");
});

test("preserves selector/field/prefix behavior and resolves current publications", async () => {
    const { runtime, views } = await setup();
    const result = searchViewDatumsTool(runtime, {
        selector,
        query: "p5",
        field: "*",
        mode: "prefix",
    });
    expect(result.content).toMatchObject({ count: 10, mode: "prefix" });
    expect(
        searchViewDatumsTool(runtime, {
            selector,
            query: "p5",
            field: "symbol",
            mode: "prefix",
        }).content
    ).toMatchObject({ count: 0 });
    views
        .root()
        .datasets.set("genes", [{ symbol: "chr1:0", alias: "literal" }]);
    expect(
        searchViewDatumsTool(runtime, {
            selector,
            query: "chr1:0",
            field: "symbol",
            mode: "exact",
        }).content
    ).toMatchObject({
        count: 1,
        truncated: false,
        matches: [{ symbol: "chr1:0" }],
    });
});

test("translates unsupported requests and stale capabilities into tool rejections", async () => {
    const { runtime, finalize } = await setup();
    for (const input of [
        { selector, query: "", field: "symbol" },
        { selector, query: "TP53", field: "unknown" },
        { selector: { scope: [], view: "absent" }, query: "TP53", field: "*" },
    ]) {
        expect(() =>
            searchViewDatumsTool(runtime, /** @type {any} */ (input))
        ).toThrow(ToolCallRejectionError);
    }
    finalize();
    expect(() =>
        searchViewDatumsTool(runtime, {
            selector,
            query: "TP53",
            field: "*",
            mode: "exact",
        })
    ).toThrow(ToolCallRejectionError);
});
