import { describe, expect, it, vi } from "vitest";
import {
    initializeViewData,
    initializeVisibleViewData,
} from "@genome-spy/core/genomeSpy/viewDataInit.js";
import { transforms } from "@genome-spy/core/data/transforms/transformFactory.js";
import SampleView from "./sampleView.js";
import MergeSampleFacets from "./mergeFacets.js";
import { createAppTestContext } from "../testUtils/appTestUtils.js";
import setupStore from "../state/setupStore.js";
import IntentExecutor from "../state/intentExecutor.js";
import Provenance from "../state/provenance.js";
import { sampleSlice } from "./state/sampleSlice.js";
import { AUGMENTED_KEY } from "../state/provenanceReducerBuilder.js";
import { subscribeTo, withMicrotask } from "../state/subscribeTo.js";
import { viewSettingsSlice } from "../viewSettingsSlice.js";

vi.mock("@fortawesome/fontawesome-svg-core", () => ({
    icon: () => ({ node: [""] }),
    dom: { css: () => "" },
}));

vi.mock("@fortawesome/free-solid-svg-icons", async (importOriginal) => ({
    __esModule: true,
    ...(await importOriginal()),
}));

transforms.mergeFacets = MergeSampleFacets;

describe("MergeSampleFacets", () => {
    async function createHiddenSummaryScenario() {
        const store = setupStore();
        const provenance = new Provenance(store);
        const intentExecutor = new IntentExecutor(store);
        const { context } = createAppTestContext();
        context.getNamedDataFromProvider = () => undefined;
        context.animator.requestTransition = (callback) => callback();

        let summaryVisible = false;
        context.isViewConfiguredVisible = (view) => {
            if (view.name == "summary") {
                return summaryVisible;
            }

            return view.spec.visible ?? true;
        };

        /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */
        const spec = {
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

        const view = new SampleView(
            spec,
            context,
            null,
            null,
            "samples",
            provenance,
            intentExecutor
        );

        await view.initializeChildren();
        view.sampleGroupView.updateGroups = () => undefined;
        await initializeViewData(
            view,
            context.dataFlow,
            context.fontManager,
            () => undefined
        );

        const summaryView = view.findDescendantByName("summary");
        expect(summaryView?.flowHandle).toBeUndefined();

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
                    context.fontManager
                );
            },
        };
    }

    it("materializes hidden aggregate summaries when they become visible", async () => {
        const { summaryView, showSummary } =
            await createHiddenSummaryScenario();

        await showSummary();

        const collector = summaryView?.getCollector?.();
        expect(collector).toBeDefined();
        expect(collector?.completed).toBe(true);
        expect(collector?.getItemCount()).toBeGreaterThan(0);
    });

    it("materializes summaries after sample state changed while the summary was hidden", async () => {
        const { store, summaryView, showSummary } =
            await createHiddenSummaryScenario();

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
        const store = setupStore();
        const provenance = new Provenance(store);
        const intentExecutor = new IntentExecutor(store);
        const { context } = createAppTestContext();
        context.getNamedDataFromProvider = () => undefined;

        let summaryVisible = false;
        context.isViewConfiguredVisible = (view) => {
            if (view.name == "summary") {
                return summaryVisible;
            }

            return view.spec.visible ?? true;
        };

        /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */
        const spec = {
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

        const view = new SampleView(
            spec,
            context,
            null,
            null,
            "samples",
            provenance,
            intentExecutor
        );

        await view.initializeChildren();
        view.sampleGroupView.updateGroups = () => undefined;

        await initializeViewData(
            view,
            context.dataFlow,
            context.fontManager,
            () => undefined
        );

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

        summaryVisible = true;

        await initializeVisibleViewData(
            view,
            context.dataFlow,
            context.fontManager
        );

        const coverageView = view.findDescendantByName("coverage");
        const collector = coverageView?.getCollector?.();
        expect(collector).toBeDefined();
        expect(collector?.completed).toBe(true);
        expect(collector?.getItemCount()).toBeGreaterThan(0);
    });

    it("materializes layered coverage summaries when visibility is restored via store subscription", async () => {
        const store = setupStore();
        const provenance = new Provenance(store);
        const intentExecutor = new IntentExecutor(store);
        const { context } = createAppTestContext();
        context.getNamedDataFromProvider = () => undefined;

        const getSummaryVisible = () =>
            !!store.getState().viewSettings.visibilities.summary;

        context.isViewConfiguredVisible = (view) => {
            if (view.name == "summary") {
                return getSummaryVisible();
            }

            return view.spec.visible ?? true;
        };

        /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */
        const spec = {
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

        const view = new SampleView(
            spec,
            context,
            null,
            null,
            "samples",
            provenance,
            intentExecutor
        );

        await view.initializeChildren();
        view.sampleGroupView.updateGroups = () => undefined;

        const visibilityUpdates = [];
        const unsubscribe = subscribeTo(
            store,
            (state) => state.viewSettings?.visibilities,
            withMicrotask(() => {
                visibilityUpdates.push(
                    initializeVisibleViewData(
                        view,
                        context.dataFlow,
                        context.fontManager
                    )
                );
            })
        );

        try {
            await initializeViewData(
                view,
                context.dataFlow,
                context.fontManager,
                () => undefined
            );

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

            store.dispatch(
                viewSettingsSlice.actions.setViewSettings({
                    visibilities: {
                        summary: true,
                    },
                })
            );

            await Promise.resolve();
            await Promise.all(visibilityUpdates);

            const coverageView = view.findDescendantByName("coverage");
            const collector = coverageView?.getCollector?.();
            expect(collector).toBeDefined();
            expect(collector?.completed).toBe(true);
            expect(collector?.getItemCount()).toBeGreaterThan(0);
        } finally {
            unsubscribe();
        }
    });

    it("recomputes an initialized summary when it is shown after hidden sample-state changes", async () => {
        const store = setupStore();
        const provenance = new Provenance(store);
        const intentExecutor = new IntentExecutor(store);
        const { context } = createAppTestContext();
        context.getNamedDataFromProvider = () => undefined;
        context.animator.requestTransition = (callback) => callback();

        const getSummaryVisible = () =>
            store.getState().viewSettings.visibilities.summary ?? true;

        context.isViewConfiguredVisible = (view) =>
            view.name == "summary"
                ? getSummaryVisible()
                : (view.spec.visible ?? true);

        /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */
        const spec = {
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

        const view = new SampleView(
            spec,
            context,
            null,
            null,
            "samples",
            provenance,
            intentExecutor
        );

        await view.initializeChildren();
        view.sampleGroupView.updateGroups = () => undefined;

        const visibilityUpdates = [];
        const unsubscribe = subscribeTo(
            store,
            (state) => state.viewSettings?.visibilities,
            withMicrotask(() => {
                visibilityUpdates.push(
                    initializeVisibleViewData(
                        view,
                        context.dataFlow,
                        context.fontManager
                    )
                );
            })
        );

        try {
            await initializeViewData(
                view,
                context.dataFlow,
                context.fontManager,
                () => undefined
            );

            const coverageView = view.findDescendantByName("coverage");
            const collector = coverageView?.getCollector?.();
            expect(collector?.getItemCount()).toBeGreaterThan(0);

            // Non-obvious: once the summary branch is initialized, showing it
            // again does not go through lazy-init, so visibility must trigger
            // a merge against the already-current sample hierarchy.
            store.dispatch(
                viewSettingsSlice.actions.setViewSettings({
                    visibilities: {
                        summary: false,
                    },
                })
            );

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

            store.dispatch(
                viewSettingsSlice.actions.setViewSettings({
                    visibilities: {
                        summary: true,
                    },
                })
            );

            await Promise.resolve();
            await Promise.all(visibilityUpdates);

            const coverageData = Array.from(collector?.getData() ?? []);
            expect(coverageData).toHaveLength(1);
            expect(coverageData[0]).toMatchObject({
                x: 1,
                x2: 4,
                coverage: 1,
            });
        } finally {
            unsubscribe();
        }
    });
});
