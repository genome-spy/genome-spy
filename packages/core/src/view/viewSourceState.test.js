import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { createViewMutationApi } from "./viewMutationApi.js";
import { createViewQuery } from "../viewQuery.js";
import SingleAxisLazySource from "../data/sources/lazy/singleAxisLazySource.js";
import { registerLazyDataSource } from "../data/sources/lazy/lazyDataSourceRegistry.js";

class ManualSource extends SingleAxisLazySource {
    /** @param {import('../spec/data.js').BigBedData} _params @param {import('./view.js').default} view */
    constructor(_params, view) {
        super(view, "x");
    }
    // Publications are controlled by the test, without network calls or timers.
    onDomainChanged() {}
    /** @param {import('../data/flowNode.js').Datum[]} rows @param {number[]} domain */
    publish(rows, domain) {
        this.publishData([rows], domain);
        this.setLoadingStatus("complete");
    }
    fail() {
        this.invalidateData();
        this.setLoadingStatus("error", "Unavailable fixture");
    }
}

/** @param {import('../spec/data.js').LazyDataParams} params @returns {params is import('../spec/data.js').BigBedData} */
function fixtureGuard(params) {
    return params.type === "bigbed";
}

describe("source observations", () => {
    test("reports pending, published bounds, moved viewport and failed lazy sources", async () => {
        const unregister = registerLazyDataSource(fixtureGuard, ManualSource);
        try {
            const { view } = await createHeadlessEngine({
                data: {
                    lazy: { type: "bigbed", url: "fixture://source" },
                    retainForInspection: true,
                },
                mark: "point",
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { domain: [0, 10], zoom: true },
                    },
                },
            });
            const views = createViewMutationApi({ viewRoot: view });
            const query = createViewQuery(views);
            const source = view.flowHandle.dataSource;
            if (!(source instanceof ManualSource))
                throw new Error("Expected manual source");
            expect(query.describeSource("root")).toMatchObject({
                ready: false,
                coverage: { type: "unknown" },
            });
            expect(() => query.readSourceData("root", { limit: null })).toThrow(
                "not ready"
            );

            source.publish([{ x: 1 }], [0, 10]);
            const state = query.describeSource("root");
            expect(state).toMatchObject({
                ready: true,
                loadingStatus: "complete",
                coverage: {
                    type: "published-domain",
                    channel: "x",
                    domain: [0, 10],
                },
            });
            if (state.coverage.type !== "published-domain")
                throw new Error("Expected published bounds");
            state.coverage.domain[0] = 99;
            expect(query.describeSource("root").coverage).toMatchObject({
                domain: [0, 10],
            });
            const result = await query.queryData("root", {
                channels: ["x"],
                limit: null,
            });
            expect(result.scope.sourceCoverage).toBe("unknown");
            expect(result.scope.primarySource).toMatchObject({
                ready: true,
                coverage: { type: "published-domain" },
            });

            await views.root().getScaleResolution("x").zoomTo([20, 30]);
            expect(query.describeSource("root")).toMatchObject({
                ready: false,
                coverage: { domain: [0, 10] },
            });
            // A source read may inspect the prior publication, but must disclose its scope.
            expect(query.readSourceData("root", { limit: null })).toMatchObject(
                { rows: [{ x: 1 }], source: { ready: false } }
            );
            await expect(
                query.queryData("root", { channels: ["x"], limit: null })
            ).rejects.toThrow("not ready");
            source.publish([], [20, 30]);
            expect(query.readSourceData("root", { limit: null })).toMatchObject(
                {
                    rows: [],
                    source: {
                        ready: true,
                        coverage: { type: "published-domain" },
                    },
                }
            );
            source.fail();
            expect(query.describeSource("root")).toMatchObject({
                ready: false,
                loadingStatus: "error",
                coverage: { type: "unknown" },
            });
            expect(() => query.readSourceData("root", { limit: null })).toThrow(
                "not ready"
            );
        } finally {
            unregister();
        }
    });

    test("source completeness does not undo display filtering", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ x: 1 }, { x: 2 }], retainForInspection: true },
            transform: [{ type: "filter", expr: "datum.x === 1" }],
            mark: "point",
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [0, 3] },
                },
            },
        });
        const query = createViewQuery(
            createViewMutationApi({ viewRoot: view })
        );
        expect(query.describeSource("root").coverage.type).toBe(
            "complete-source"
        );
        expect(query.readSourceData("root", { limit: null }).rows).toHaveLength(
            2
        );
        const result = await query.queryData("root", {
            channels: ["x"],
            limit: null,
        });
        expect(result.rows).toHaveLength(1);
        expect(result.scope.sourceCoverage).toBe("unknown");
    });

    test("reports inherited opacity and hidden ancestors without claiming pixel visibility", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ x: 1 }] },
            params: [{ name: "alpha", value: 0 }],
            opacity: { expr: "alpha" },
            layer: [
                {
                    name: "track",
                    mark: "point",
                    encoding: { x: { field: "x", type: "quantitative" } },
                },
            ],
        });
        const views = createViewMutationApi({ viewRoot: view });
        const query = createViewQuery(views);
        const handle = views.get({ scope: [], view: "track" });
        expect(query.describe(handle).visibility).toEqual({
            configured: true,
            ancestorsVisible: true,
            opacity: 0,
        });
        handle.params.get("alpha").setValue(0.5);
        expect(query.describe(handle).visibility.opacity).toBe(0.5);

        const hidden = await createHeadlessEngine(
            {
                visible: false,
                data: { values: [{ x: 1 }], retainForInspection: true },
                layer: [
                    {
                        name: "hidden-track",
                        mark: "point",
                        encoding: { x: { field: "x", type: "quantitative" } },
                    },
                ],
            },
            {
                contextOptions: {
                    isViewConfiguredVisible: (view) => view.isVisibleInSpec(),
                },
            }
        );
        const hiddenQuery = createViewQuery(
            createViewMutationApi({ viewRoot: hidden.view })
        );
        expect(
            hiddenQuery.describe({ scope: [], view: "hidden-track" }).visibility
        ).toMatchObject({ ancestorsVisible: false });
        expect(hiddenQuery.describeSource("root")).toMatchObject({
            retentionEnabled: true,
            ready: false,
        });
        expect(() =>
            hiddenQuery.readSourceData("root", { limit: null })
        ).toThrow("not ready");
    });
});
