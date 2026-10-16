import { test, expect } from "@playwright/test";
import { fileURLToPath, URL } from "node:url";

const queryModule =
    "/@fs" +
    fileURLToPath(new URL("../../core/src/viewQuery.js", import.meta.url));

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
            data: { name: "observations", retainForInspection: true },
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
                    scale: { domain: [0, 5], zoom: true },
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
    test(`queries data and selects ${markType} records with picking disabled`, async ({
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

        const observed = await page.evaluate(async (queryModule) => {
            const api = (
                await import(
                    globalThis.document.querySelector(
                        'script[type="module"][src*="/index.js"]'
                    ).src
                )
            ).getCurrentEmbedResult();
            const { createViewQuery } = await import(queryModule);
            const query = createViewQuery(api.views);
            const track = api.views.get({ scope: [], view: "observations" });
            const source = query.readSourceData(track, { limit: null });
            const description = query.describe(track);
            const result = await query.queryData(track, {
                channels: ["x", "y"],
                fields: ["name", "x", "y"],
                limit: 1,
            });
            const selection = track.params.getSelection("selected");
            selection.setValue([["first"]]);
            const selected = selection.getValue();
            const svg = await (await api.imageExport.svg()).blob.text();
            await track.getScaleResolution("x").zoomTo([0, 1.5]);
            const narrowed = await query.queryData(track, {
                channels: ["x"],
                fields: ["name"],
                limit: null,
            });
            // The host explicitly clears membership before replacing its data.
            selection.clear();
            api.datasets.set("observations", [
                { x: 1, y: 1, name: "replacement" },
            ]);
            const cleared = selection.getValue();
            const replacement = query.readSourceData(track, { limit: null });
            await api.views.remove(track);
            let staleError;
            try {
                query.describe(track);
            } catch (error) {
                staleError = error.code;
            }
            return {
                source,
                description,
                result,
                selected,
                svg,
                narrowed,
                cleared,
                replacement,
                staleError,
            };
        }, queryModule);

        expect(observed.source.rows.map((row) => row.name)).toEqual([
            "first",
            "second",
            "filtered",
        ]);
        expect(observed.source.scope).toBe("loaded-source");
        expect(observed.description.visibility).toEqual({
            configured: true,
            ancestorsVisible: true,
            opacity: 1,
        });
        expect(observed.source.source.coverage.type).toBe("complete-source");
        expect(observed.result.rows).toEqual([{ name: "first", x: 1, y: 2 }]);
        expect(observed.result).toMatchObject({
            rowsMatched: 2,
            truncated: true,
            scope: { sourceCoverage: "unknown" },
        });
        expect(observed.selected.data).toEqual([{ x: 1, y: 2, name: "first" }]);
        expect(observed.svg).toContain('fill-opacity="0.2"');
        expect(observed.narrowed.rows).toEqual([{ name: "first" }]);
        expect(observed.cleared).toMatchObject({ active: false, data: [] });
        expect(observed.replacement.rows).toEqual([
            { x: 1, y: 1, name: "replacement" },
        ]);
        expect(observed.replacement.dataRevision).toBeGreaterThan(
            observed.source.dataRevision
        );
        expect(observed.staleError).toBe("staleHandle");
        expect(errors).toEqual([]);
    });
}
