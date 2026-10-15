import { test, expect } from "@playwright/test";
import { fileURLToPath, URL } from "node:url";

const queryModule =
    "/@fs" +
    fileURLToPath(new URL("../../core/src/viewQuery.js", import.meta.url));

const fixture = {
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

test("queries retained source rows and renders point findings through the public API", async ({
    page,
}) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/query-fixture.json", (route) =>
        route.fulfill({ json: fixture })
    );
    await page.goto("/?spec=/query-fixture.json");
    await expect
        .poll(() =>
            page.evaluate(async () =>
                Boolean((await import("/index.js")).getCurrentEmbedResult())
            )
        )
        .toBe(true);

    const observed = await page.evaluate(async (queryModule) => {
        const api = (await import("/index.js")).getCurrentEmbedResult();
        const { createViewQuery } = await import(queryModule);
        const query = createViewQuery(api.views);
        const track = api.views.get({ scope: [], view: "observations" });
        const source = query.readSourceData(track, { limit: null });
        const description = query.describe(track);
        const result = await query.queryData(track, {
            channels: ["x", "y"],
            fields: ["name", "x", "y"],
            limit: 1,
            aggregate: [{ op: "count", as: "count" }],
        });
        const targets = await query.queryData(track, {
            channels: ["x", "y"],
            fields: ["name"],
            limit: 1,
            includeAnnotationTargets: true,
        });
        await query.annotations.replace({
            targets: [
                {
                    reference: targets.annotationTargets[0],
                    text: "Agent finding",
                },
            ],
            emphasis: "purple",
            connectors: true,
        });
        const annotated = query.annotations.inspect();
        const svg = await (await api.imageExport.svg()).blob.text();
        await track.getScaleResolution("x").zoomTo([0, 1.5]);
        const narrowed = await query.queryData(track, {
            channels: ["x"],
            fields: ["name"],
            limit: null,
        });
        // Publishing new source data must expire the previous visual evidence.
        api.datasets.set("observations", [{ x: 1, y: 1, name: "replacement" }]);
        const invalidated = query.annotations.inspect();
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
            annotated,
            svg,
            narrowed,
            invalidated,
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
        aggregates: { count: 2 },
        scope: { sourceCoverage: "unknown" },
    });
    expect(observed.annotated.activeTargets).toBe(1);
    expect(observed.svg).toContain("Agent finding");
    expect(observed.narrowed.rows).toEqual([{ name: "first" }]);
    expect(observed.invalidated).toMatchObject({
        activeTargets: 0,
        invalidated: true,
    });
    expect(observed.replacement.rows).toEqual([
        { x: 1, y: 1, name: "replacement" },
    ]);
    expect(observed.replacement.dataRevision).toBeGreaterThan(
        observed.source.dataRevision
    );
    expect(observed.staleError).toBe("staleHandle");
    expect(errors).toEqual([]);
});
