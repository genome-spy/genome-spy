import { test, expect } from "@playwright/test";
const fixture = {
    params: [{ name: "selected", select: "point" }],
    datasets: {
        observations: [
            { x: 1, y: 2, name: "first" },
            { x: 2, y: 3, name: "second" },
            { x: 4, y: 4, name: "filtered" },
        ],
    },
    vconcat: [
        {
            name: "observations",
            width: 400,
            height: 250,
            data: { name: "observations" },
            transform: [{ type: "filter", expr: "datum.x < 3" }],
            mark: "point",
            encoding: {
                key: { field: "name" },
                opacity: {
                    condition: { param: "selected", empty: false, value: 1 },
                    value: 0.2,
                },
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { name: "position", domain: [0, 5], zoom: true },
                },
                y: {
                    field: "y",
                    type: "quantitative",
                    scale: { domain: [0, 5] },
                },
            },
        },
    ],
};

for (const markType of ["point", "text", "rect"]) {
    test(`reads data and selects ${markType} records with picking disabled`, async ({
        page,
    }) => {
        // An inherited selection still needs a GPU identity attribute when hover
        // picking is disabled. CPU encoders alone cannot detect that regression.
        const spec = globalThis.structuredClone(fixture);
        spec.vconcat[0].mark = { type: markType, tooltip: null };
        if (markType === "text")
            spec.vconcat[0].encoding.text = { field: "name" };
        if (markType === "rect") {
            spec.vconcat[0].encoding.x2 = { field: "x", offset: 0.25 };
            spec.vconcat[0].encoding.y2 = { field: "y", offset: 0.25 };
        }
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
            if (message.type() === "error") errors.push(message.text());
        });
        await page.route(
            (url) => url.pathname === "/query-fixture.json",
            (route) => route.fulfill({ json: spec })
        );
        await page.goto("/?spec=/query-fixture.json");
        await expect
            .poll(() =>
                page.evaluate(async () =>
                    Boolean(
                        (
                            await import(
                                globalThis.document.querySelector(
                                    'script[type="module"][src*="/index.js"]'
                                ).src
                            )
                        ).getCurrentEmbedResult()
                    )
                )
            )
            .toBe(true);

        const observed = await page.evaluate(async () => {
            const api = (
                await import(
                    globalThis.document.querySelector(
                        'script[type="module"][src*="/index.js"]'
                    ).src
                )
            ).getCurrentEmbedResult();
            const track = api.views.get({ scope: [], view: "observations" });
            const result = track.readData({ limit: 1 });
            const selection = track.params.getSelection("selected");
            selection.setValue([["first"]]);
            const selected = selection.getValue();
            const svg = await (await api.imageExport.svg()).blob.text();
            const scale = api.getScaleResolutionByName("position");
            await scale.zoomTo([0, 1.5]);
            const [start, end] = scale.getDomain();
            const narrowed = track
                .readData({ limit: 10 })
                .rows.filter((row) => row.x >= start && row.x <= end);
            // The host explicitly clears membership before replacing its data.
            selection.clear();
            api.datasets.set("observations", [
                { x: 1, y: 1, name: "replacement" },
            ]);
            const cleared = selection.getValue();
            const replacement = track.readData({ limit: 10 });
            await api.views.remove(track);
            let staleError;
            try {
                track.readData({ limit: 1 });
            } catch (error) {
                staleError = error.code;
            }
            return {
                result,
                selected,
                svg,
                narrowed,
                cleared,
                replacement,
                staleError,
            };
        });

        expect(observed.result.rows).toEqual([{ name: "first", x: 1, y: 2 }]);
        expect(observed.result).toMatchObject({
            truncated: true,
        });
        expect(observed.selected.data).toEqual([{ x: 1, y: 2, name: "first" }]);
        expect(observed.svg).toContain('fill-opacity="0.2"');
        expect(observed.narrowed).toEqual([{ x: 1, y: 2, name: "first" }]);
        expect(observed.cleared).toMatchObject({ active: false, data: [] });
        expect(observed.replacement.rows).toEqual([
            { x: 1, y: 1, name: "replacement" },
        ]);
        expect(observed.staleError).toBe("staleHandle");
        expect(errors).toEqual([]);
    });
}

test("reads a brushed reference sequence, fills an empty logo track, and selects bases", async ({
    page,
}) => {
    // A second contig catches accidental use of chromosome-relative positions
    // where the existing interval parameter expects linear coordinates.
    const spec = {
        assembly: "toy",
        genomes: {
            toy: {
                contigs: [
                    { name: "chr1", size: 100 },
                    { name: "chr2", size: 1000 },
                ],
            },
        },
        datasets: { analysis: [] },
        params: [
            { name: "brush", select: { type: "interval", encodings: ["x"] } },
        ],
        encoding: {
            x: {
                chrom: "chrom",
                pos: "pos",
                type: "locus",
                scale: {
                    name: "genomeScale",
                    domain: [
                        { chrom: "chr2", pos: 90 },
                        { chrom: "chr2", pos: 120 },
                    ],
                    zoom: true,
                },
            },
        },
        resolve: { scale: { x: "shared" } },
        vconcat: [
            {
                name: "reference",
                width: 400,
                height: 45,
                data: {
                    values: [
                        { chrom: "chr2", start: 100, sequence: "ACGTTGCAACGT" },
                    ],
                },
                transform: [
                    {
                        type: "flattenSequence",
                        field: "sequence",
                        as: ["offset", "base"],
                    },
                    {
                        type: "formula",
                        expr: "datum.start + datum.offset",
                        as: "pos",
                    },
                ],
                mark: { type: "text", fitToBand: true },
                encoding: { text: { field: "base" } },
            },
            {
                name: "scores",
                width: 400,
                height: 100,
                data: { name: "analysis" },
                params: [{ name: "chosen", select: "point" }],
                mark: {
                    type: "text",
                    size: 100,
                    squeeze: true,
                    fitToBand: true,
                    logoLetters: true,
                    paddingX: 0,
                    paddingY: 0,
                    tooltip: null,
                },
                encoding: {
                    key: [{ field: "chrom" }, { field: "pos" }],
                    y: {
                        datum: 0,
                        type: "quantitative",
                        scale: { domain: [0, 1], nice: false },
                    },
                    y2: { field: "score" },
                    text: { field: "base" },
                    opacity: {
                        condition: { param: "chosen", empty: false, value: 1 },
                        value: 0.2,
                    },
                },
            },
        ],
    };
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
    });
    await page.route(
        (url) => url.pathname === "/sequence-analysis-fixture.json",
        (route) => route.fulfill({ json: spec })
    );
    await page.goto("/?spec=/sequence-analysis-fixture.json");
    await expect
        .poll(() =>
            page.evaluate(async () =>
                Boolean(
                    (
                        await import(
                            globalThis.document.querySelector(
                                'script[type="module"][src*="/index.js"]'
                            ).src
                        )
                    ).getCurrentEmbedResult()
                )
            )
        )
        .toBe(true);
    const observed = await page.evaluate(async () => {
        const api = (
            await import(
                globalThis.document.querySelector(
                    'script[type="module"][src*="/index.js"]'
                ).src
            )
        ).getCurrentEmbedResult();
        const scale = api.getScaleResolutionByName("genomeScale");
        // Gene lookup and assembly offsets belong to the app in this fixture.
        const gene = { chrom: "chr2", start: 100, end: 112 };
        await scale.zoomTo(
            [
                { chrom: gene.chrom, pos: gene.start },
                { chrom: gene.chrom, pos: gene.end - 1 },
            ],
            0
        );
        api.params
            .get("brush")
            .setValue({ type: "interval", intervals: { x: [203, 208] } });
        const brush = api.params.getSelection("brush").getValue();
        await api.awaitVisibleLazyData(globalThis.AbortSignal.timeout(5000));
        const read = api.views
            .get({ scope: [], view: "reference" })
            .readData({ limit: 100 });
        if (read.truncated) throw new Error("Incomplete read");
        const [start, end] = brush.complexIntervals.x;
        const bases = read.rows
            .filter(
                (row) =>
                    row.chrom === start.chrom &&
                    row.pos >= start.pos &&
                    row.pos < end.pos
            )
            .sort((a, b) => a.pos - b.pos);
        if (
            bases.length !== end.pos - start.pos ||
            bases.some((row, i) => row.pos !== start.pos + i)
        )
            throw new Error("Incomplete reference coverage");
        // Stand-in for an app-side sequence analysis, outside GenomeSpy.
        const results = bases.map(({ chrom, pos, base }) => ({
            chrom,
            pos,
            base,
            score: base === "G" || base === "C" ? 1 : 0.25,
        }));
        const logo = api.views.get({ scope: [], view: "scores" });
        const empty = logo.readData({ limit: 10 });
        api.datasets.set("analysis", results);
        logo.params
            .getSelection("chosen")
            .setValue(
                results
                    .filter((row) => row.score === 1)
                    .map((row) => [row.chrom, row.pos])
            );
        const svg = new globalThis.DOMParser().parseFromString(
            await (await api.imageExport.svg()).blob.text(),
            "image/svg+xml"
        );
        return {
            empty,
            sequence: bases.map((row) => row.base).join(""),
            brush: brush.complexIntervals.x,
            data: logo.readData({ limit: 10 }),
            selected: logo.params.getSelection("chosen").getValue().data,
            highlighted: svg.querySelectorAll(
                '[data-name="scores"] [fill-opacity="1"]'
            ).length,
            faded: svg.querySelectorAll(
                '[data-name="scores"] [fill-opacity="0.2"]'
            ).length,
        };
    });
    expect(observed.empty).toEqual({ rows: [], truncated: false });
    expect(observed.sequence).toBe("TTGCA");
    expect(observed.brush).toEqual([
        { chrom: "chr2", pos: 103 },
        { chrom: "chr2", pos: 108 },
    ]);
    expect(observed.data.rows).toHaveLength(5);
    expect(observed.selected.map((row) => row.pos)).toEqual([105, 106]);
    expect(observed.highlighted).toBe(2);
    expect(observed.faded).toBe(3);
    expect(errors).toEqual([]);
});
