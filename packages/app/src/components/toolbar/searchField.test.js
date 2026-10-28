// @vitest-environment jsdom
import { createTestEmbed } from "@genome-spy/core/view/embedTestUtils.js";
import { createDatumSearch } from "@genome-spy/core/search";
import { expect, it, onTestFinished, vi } from "vitest";
import SearchField from "./searchField.js";

/** Real Core data and scale capabilities exercise the mounted App component. */
async function setup() {
    const fixture = await createTestEmbed({
        name: "genes",
        datasets: {
            rows: [
                { symbol: "FIRST", alias: "alpha", start: 0, end: 1 },
                { symbol: "LAST", alias: "omega", start: 99, end: 100 },
                { symbol: "TP53", alias: "p53", start: 10, end: 20 },
                { symbol: "chr99", alias: "custom label", start: 30, end: 40 },
            ],
        },
        data: { name: "rows" },
        mark: "rect",
        encoding: {
            x: {
                field: "start",
                type: "locus",
                scale: {
                    assembly: { contigs: [{ name: "scaffold", size: 100 }] },
                    zoom: true,
                },
            },
            x2: { field: "end" },
            search: [{ field: "symbol" }, { field: "alias" }],
        },
    });
    const field = new SearchField();
    field.app = /** @type {any} */ ({
        genomeSpy: { viewRoot: fixture.root },
        datumSearch: createDatumSearch(fixture.views),
        getSampleView: () => undefined,
    });
    document.body.append(field);
    onTestFinished(() => field.remove());
    await field.updateComplete;
    const scale = fixture.root.getScaleResolution("x");
    return { ...fixture, field, scale, input: field.querySelector("input") };
}

it("uses the active assembly and preserves native endpoints and domains when formatting", async () => {
    const { field, scale } = await setup();
    expect(field.getDefaultValue()).toBe("scaffold:1-100");
    await field.search("scaffold:10-20");
    expect(scale.getDomain()).toEqual([9, 20]);
    expect(field.getDefaultValue()).toBe("scaffold:10-20");
    expect(field.getDefaultValue()).toBe("scaffold:10-20");
    expect(scale.getDomain()).toEqual([9, 20]);
    await expect(field.search("scaffold:0")).rejects.toThrow(/positive/);
    expect(scale.getDomain()).toEqual([9, 20]);
});

it("searches unknown bare contig-like names as literal record values", async () => {
    const { field, scale } = await setup();
    await field.search("chr99");
    expect(scale.getDomain()).toEqual([29, 41]);
    await expect(field.search("chr99:10")).rejects.toThrow(/Unknown contig/);
    expect(scale.getDomain()).toEqual([29, 41]);
});

it("keeps padded first- and last-base gene navigation inside the active assembly", async () => {
    const { field, scale } = await setup();
    for (const term of ["FIRST", "LAST"]) {
        await field.search(term);
        const [begin, end] = scale.getDomain();
        expect(begin).toBeGreaterThanOrEqual(0);
        expect(end).toBeLessThanOrEqual(100);
        expect(end).toBeGreaterThan(begin);
        expect(field.getDefaultValue()).toMatch(/^scaffold:\d+-\d+$/);
    }
});

it("shows examples for each field and refreshes them on focus after data replacement", async () => {
    const { field, views, scale, input } = await setup();
    const help = () => field.querySelector(".search-help").textContent;
    expect(help()).toContain("(symbol)");
    expect(help()).toContain("(alias)");
    expect(help()).toContain("FIRST");
    expect(help()).toContain("p53");
    input.focus();
    await field.updateComplete;
    input.blur();
    await field.updateComplete;

    const domain = scale.getDomain();
    views
        .root()
        .datasets.set("rows", [
            { symbol: "BRCA1", alias: "breast cancer 1", start: 10, end: 20 },
        ]);
    expect(scale.getDomain()).toEqual(domain);
    input.focus();
    await field.updateComplete;
    expect(help()).toContain("BRCA1");
    expect(help()).toContain("breast cancer 1");
    expect(help()).not.toContain("FIRST");
});

it("cancels pending domain updates when disconnected before embed finalization", async () => {
    const { field, scale, input, finalize } = await setup();
    vi.useFakeTimers();
    try {
        await scale.zoomTo([10, 20]);
        await vi.advanceTimersByTimeAsync(60);
        await field.updateComplete;
        expect(input.value).toBe("scaffold:11-21");

        // Leave a second domain update pending while the host tears down.
        await scale.zoomTo([20, 30]);
        field.remove();
        finalize();
        vi.advanceTimersByTime(60);
        await expect(field.updateComplete).resolves.toBe(true);
    } finally {
        vi.useRealTimers();
    }
});
