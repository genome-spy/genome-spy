import { describe, expect, it, vi } from "vitest";
import {
    initializeViewData,
    initializeVisibleViewData,
} from "@genome-spy/core/genomeSpy/viewDataInit.js";
import { transforms } from "@genome-spy/core/data/transforms/transformFactory.js";
import { UNIQUE_ID_KEY } from "@genome-spy/core/data/transforms/identifier.js";
import MergeSampleFacets from "./mergeFacets.js";
import { createSampleViewForTest } from "../testUtils/appTestUtils.js";
import { sampleSlice } from "./state/sampleSlice.js";
import { AUGMENTED_KEY } from "../state/provenanceReducerBuilder.js";

transforms.mergeFacets = MergeSampleFacets;

describe("MergeSampleFacets visibility", () => {
    /**
     * @param {import("@genome-spy/app/spec/sampleView.js").SampleSpec} spec
     * @param {boolean} [summaryVisible]
     */
    async function createMergeFacetsScenario(spec, summaryVisible = false) {
        const { view, context, store } = await createSampleViewForTest({
            spec,
            initializeFlow: false,
        });
        context.isViewConfiguredVisible = (child) =>
            child.name === "summary" ? summaryVisible : child.isVisibleInSpec();
        context.requestLayoutReflow = () => {
            view.visit((child) =>
                child.handleBroadcast({ type: "layoutComputed" })
            );
        };
        await initializeViewData(
            view,
            context.dataFlow,
            context.textMetrics,
            () => undefined
        );

        const summaryView = view.findDescendantByName("summary");
        if (!summaryVisible) {
            expect(summaryView?.flowHandle).toBeUndefined();
        }

        return {
            store,
            context,
            view,
            summaryView,
            showSummary: async () => {
                summaryVisible = true;

                await initializeVisibleViewData(
                    view,
                    context.dataFlow,
                    context.textMetrics
                );
            },
        };
    }

    /**
     * @returns {import("@genome-spy/app/spec/sampleView.js").SampleSpec}
     */
    function createIdentitySummarySpec() {
        return {
            samples: {
                identity: {
                    data: {
                        values: [{ sample: "A" }, { sample: "B" }],
                    },
                    idField: "sample",
                },
            },
            spec: {
                data: {
                    values: [
                        { sample: "A", x: 1, x2: 4 },
                        { sample: "B", x: 2, x2: 5 },
                    ],
                },
                mark: "rect",
                encoding: {
                    sample: { field: "sample" },
                    x: { field: "x", type: "quantitative" },
                    x2: { field: "x2" },
                },
                aggregateSamples: [
                    {
                        name: "summary",
                        mark: "rect",
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            x2: { field: "x2" },
                            y: { datum: 1, type: "quantitative" },
                        },
                    },
                ],
            },
        };
    }

    /**
     * @returns {import("@genome-spy/app/spec/sampleView.js").SampleSpec}
     */
    function createCoverageSummarySpec() {
        return {
            samples: {
                identity: {
                    data: {
                        values: [{ sample: "A" }, { sample: "B" }],
                    },
                    idField: "sample",
                },
            },
            spec: {
                data: {
                    values: [
                        { sample: "A", x: 1, x2: 4, value: 1 },
                        { sample: "B", x: 2, x2: 5, value: 2 },
                    ],
                },
                mark: "rect",
                encoding: {
                    sample: { field: "sample" },
                    x: { field: "x", type: "quantitative" },
                    x2: { field: "x2" },
                    color: { field: "value", type: "quantitative" },
                },
                aggregateSamples: [
                    {
                        name: "summary",
                        visible: false,
                        encoding: {
                            y: { field: "coverage", type: "quantitative" },
                            color: null,
                        },
                        layer: [
                            {
                                data: { values: [{}] },
                                mark: "rule",
                                encoding: {
                                    y: { datum: 0, type: "quantitative" },
                                    x: null,
                                    x2: null,
                                },
                            },
                            {
                                name: "coverage",
                                transform: [
                                    {
                                        type: "project",
                                        fields: ["sample", "x", "x2"],
                                    },
                                    {
                                        type: "coverage",
                                        start: "x",
                                        end: "x2",
                                    },
                                    {
                                        type: "formula",
                                        expr: "datum.coverage / sampleCount",
                                        as: "coverage",
                                    },
                                ],
                                mark: "rect",
                                encoding: {
                                    color: null,
                                },
                            },
                        ],
                    },
                ],
            },
        };
    }

    /**
     * @returns {import("@genome-spy/app/spec/sampleView.js").SampleSpec}
     */
    function createAggregateSummarySpec() {
        return {
            samples: {
                identity: {
                    data: {
                        values: [{ sample: "A" }, { sample: "B" }],
                    },
                    idField: "sample",
                },
            },
            spec: {
                data: {
                    values: [
                        { sample: "A", value: 1 },
                        { sample: "A", value: 2 },
                        { sample: "B", value: 3 },
                        { sample: "B", value: 4 },
                    ],
                },
                mark: "rect",
                encoding: {
                    sample: { field: "sample" },
                    x: { field: "sample", type: "nominal" },
                },
                aggregateSamples: [
                    {
                        name: "summary",
                        mark: "rect",
                        encoding: {
                            x: { field: "sample", type: "nominal" },
                            y: { field: "total", type: "quantitative" },
                        },
                        transform: [
                            {
                                type: "aggregate",
                                groupby: ["sample"],
                                fields: ["value"],
                                ops: ["sum"],
                                as: ["total"],
                            },
                        ],
                    },
                ],
            },
        };
    }

    describe("hidden summaries", () => {
        it("materializes hidden aggregate summaries when they become visible", async () => {
            const { summaryView, showSummary } =
                await createMergeFacetsScenario(createIdentitySummarySpec());

            await showSummary();

            const collector = summaryView?.getCollector?.();
            expect(collector).toBeDefined();
            expect(collector?.completed).toBe(true);
            expect(collector?.getItemCount()).toBeGreaterThan(0);
        });

        it("materializes summaries after sample state changed while the summary was hidden", async () => {
            const { store, summaryView, showSummary } =
                await createMergeFacetsScenario(createIdentitySummarySpec());

            store.dispatch(
                sampleSlice.actions.sortBy({
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "order",
                    },
                    [AUGMENTED_KEY]: {
                        values: {
                            A: 2,
                            B: 1,
                        },
                    },
                })
            );

            await showSummary();

            const collector = summaryView?.getCollector?.();
            expect(collector).toBeDefined();
            expect(collector?.completed).toBe(true);
            expect(collector?.getItemCount()).toBeGreaterThan(0);
        });

        it("materializes layered coverage summaries after sample state changed while hidden", async () => {
            const { store, view, showSummary } =
                await createMergeFacetsScenario(createCoverageSummarySpec());

            store.dispatch(
                sampleSlice.actions.sortBy({
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "order",
                    },
                    [AUGMENTED_KEY]: {
                        values: {
                            A: 2,
                            B: 1,
                        },
                    },
                })
            );

            await showSummary();

            const coverageView = view.findDescendantByName("coverage");
            const collector = coverageView?.getCollector?.();
            expect(collector).toBeDefined();
            expect(collector?.completed).toBe(true);
            expect(collector?.getItemCount()).toBeGreaterThan(0);
        });

        it("materializes aggregated summaries for each sample group", async () => {
            const { summaryView, showSummary } =
                await createMergeFacetsScenario(createAggregateSummarySpec());

            await showSummary();

            const collector = summaryView?.getCollector?.();
            expect(collector).toBeDefined();
            expect(collector?.completed).toBe(true);
            const summaryData = Array.from(collector?.getData() ?? []).map(
                ({ __uniqueId, ...datum }) => datum
            );
            expect(summaryData).toEqual([
                { sample: "A", total: 3 },
                { sample: "B", total: 7 },
            ]);
        });
    });

    it("publishes current coverage when a parameter reveals a previously loaded summary", async () => {
        const spec = createCoverageSummarySpec();
        spec.params = [{ name: "showSummary", value: true }];
        if (!("aggregateSamples" in spec.spec))
            throw new Error("Expected a summary");
        spec.spec.aggregateSamples[0].visible = { expr: "showSummary" };
        const { store, view } = await createMergeFacetsScenario(spec, true);
        const collector = view.findDescendantByName("coverage").getCollector();
        expect(collector.getItemCount()).toBeGreaterThan(1);
        view.paramRuntime.setValue("showSummary", false);
        await view.paramRuntime.whenPropagated();

        store.dispatch(
            sampleSlice.actions.filterByNominal({
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "group",
                },
                values: ["keep"],
                remove: false,
                [AUGMENTED_KEY]: {
                    values: {
                        A: "keep",
                        B: "drop",
                    },
                },
            })
        );

        view.paramRuntime.setValue("showSummary", true);
        await vi.waitFor(() => expect(collector.getItemCount()).toBe(1));
        const coverageData = Array.from(collector?.getData() ?? []);
        expect(coverageData[0]).toMatchObject({
            x: 1,
            x2: 4,
            coverage: 1,
        });
    });

    it("recomputes categorical frequencies for the samples in each group", async () => {
        const { store, view, summaryView } = await createMergeFacetsScenario(
            {
                samples: {
                    identity: {
                        data: {
                            values: [
                                { sample: "A" },
                                { sample: "B" },
                                { sample: "C" },
                            ],
                        },
                        idField: "sample",
                    },
                },
                spec: {
                    name: "segments",
                    data: {
                        // Sample A's intervals arrive out of start order.
                        values: [
                            { sample: "A", start: 2, end: 3, state: "active" },
                            { sample: "B", start: 0, end: 2, state: "quiet" },
                            { sample: "A", start: 0, end: 2, state: "active" },
                            { sample: "C", start: 0, end: 2, state: "quiet" },
                            { sample: "B", start: 2, end: 3, state: null },
                        ],
                    },
                    mark: "rect",
                    encoding: {
                        sample: { field: "sample" },
                        x: {
                            field: "start",
                            type: "quantitative",
                            scale: { zoom: true },
                        },
                        x2: { field: "end" },
                        tooltip: [{ field: "state" }],
                    },
                    aggregateSamples: [
                        {
                            name: "summary",
                            mark: "rect",
                            transform: [
                                {
                                    type: "categoricalCoverage",
                                    start: "start",
                                    end: "end",
                                    category: "state",
                                },
                                {
                                    type: "formula",
                                    expr: "datum.count / datum.total",
                                    as: "frequency",
                                },
                            ],
                            encoding: {
                                y: { field: "frequency", type: "quantitative" },
                                tooltip: [{ field: "category" }],
                            },
                        },
                    ],
                },
            },
            true
        );

        const summary = summaryView.getCollector();
        const segments = view.findDescendantByName("segments").getCollector();
        const firstSpan = () =>
            summary.facetBatches
                .get([0])
                ?.find((row) => row.start === 0 && row.category === "active");

        store.dispatch(
            sampleSlice.actions.groupByNominal({
                attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "tissue" },
                [AUGMENTED_KEY]: {
                    values: { A: "Heart", B: "Heart", C: "Lung" },
                },
            })
        );
        await vi.waitFor(() => {
            expect(firstSpan()).toMatchObject({
                end: 2,
                count: 1,
                total: 2,
                frequency: 0.5,
            });
            expect(
                summary.facetBatches.get([0]).find((row) => row.start === 2)
            ).toMatchObject({ end: 3, total: 1, frequency: 1 });
            expect(summary.facetBatches.get([1])[0]).toMatchObject({
                category: "quiet",
                total: 1,
            });
        });

        store.dispatch(
            sampleSlice.actions.filterByNominal({
                attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "filter" },
                values: ["keep"],
                remove: false,
                [AUGMENTED_KEY]: {
                    values: { A: "keep", B: "drop", C: "keep" },
                },
            })
        );
        await vi.waitFor(() => {
            expect(firstSpan()).toMatchObject({
                end: 3,
                count: 1,
                total: 1,
                frequency: 1,
            });
        });

        const span = firstSpan();
        const id = span[UNIQUE_ID_KEY];
        expect(id).toBeGreaterThan(0);
        expect(summary.findDatumByUniqueId(id)).toBe(span);
        expect(segments.findDatumByUniqueId(id)).toBeUndefined();
    });
});
