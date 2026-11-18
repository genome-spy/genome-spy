// @ts-check
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { initializeViewData } from "@genome-spy/core/genomeSpy/viewDataInit.js";
import { finalizeViewConfiguration } from "@genome-spy/core/genomeSpy/viewHierarchyConfig.js";
import { createSampleViewForTest } from "../testUtils/appTestUtils.js";

describe("SampleView ensureViewAttributeAvailability", () => {
    it("evaluates track visibility at the action's target domain", async () => {
        const { view, context } = await createSampleViewForTest({
            spec: {
                scales: { x: { type: "linear", domain: [0, 100], zoom: true } },
                samples: {
                    identity: {
                        data: { values: [{ sample: "S1" }] },
                        idField: "sample",
                    },
                },
                data: { values: [{ sample: "S1", x: 2 }] },
                spec: {
                    name: "detail",
                    visible: { expr: "span(domain('x')) < 10" },
                    mark: "point",
                    encoding: {
                        sample: { field: "sample" },
                        x: { field: "x", type: "quantitative" },
                    },
                },
            },
            initializeFlow: false,
        });
        onTestFinished(() => view.disposeSubtree());
        const root = view.getLayoutAncestors().at(-1);
        finalizeViewConfiguration(root);
        await initializeViewData(
            root,
            context.dataFlow,
            context.textMetrics,
            () => undefined
        );
        const detail = view.findDescendantByName("detail");
        expect(detail.isVisible()).toBe(false);

        /** @type {import("./sampleViewTypes.js").ViewAttributeSpecifier} */
        const attribute = {
            view: "detail",
            field: "x",
            interval: [1, 4],
            aggregation: { op: "count" },
        };
        await view.ensureViewAttributeAvailability(attribute);

        expect(detail.getScaleResolution("x").getDomain()).toEqual([1, 4]);
        expect(detail.isVisible()).toBe(true);
        expect(detail.flowHandle?.collector.getItemCount()).toBe(1);
        await expect(
            view.ensureViewAttributeAvailability({
                ...attribute,
                domainAtActionTime: [0, 100],
            })
        ).rejects.toThrow(/detail.*hidden/);
    });

    it("awaits zoom and subtree readiness before resolving", async () => {
        /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */
        const spec = {
            data: {
                values: [{ sample: "S1", x: 1 }],
            },
            name: "cohort",
            params: [{ name: "show", value: false }],
            visible: { expr: "show" },
            samples: {},
            spec: {
                name: "target-view",
                mark: "point",
                encoding: {
                    sample: { field: "sample" },
                    x: { field: "x", type: "quantitative" },
                },
            },
        };

        const { view, store } = await createSampleViewForTest({
            spec,
            initializeFlow: false,
        });

        // Prevent sample extraction from running during subtree readiness.
        view.getSamples = () =>
            /** @type {any} */ ([
                { id: "dummy", displayName: "dummy", indexNumber: 0 },
            ]);

        const target = view.findDescendantByName("target-view");
        const zoom = Promise.withResolvers();
        const zoomTo = vi.fn(() => zoom.promise).mockResolvedValueOnce();

        // Non-obvious: patch zoomTo to control the async sequence.
        target.getScaleResolution = () =>
            /** @type {any} */ ({
                getScale: () => ({ type: "linear" }),
                getDomain: () => [0, 10],
                zoomTo,
            });

        await expect(
            view.ensureViewAttributeAvailability({
                view: "target-view",
                field: "x",
                locus: 5,
            })
        ).rejects.toThrow(/cohort.*hidden/);
        expect(store.getState().viewSettings.visibilities).toEqual({});
        expect(zoomTo).toHaveBeenCalledTimes(1);
        view.paramRuntime.setValue("show", true);
        await view.paramRuntime.whenPropagated();

        let resolved = false;
        const ensurePromise = view
            .ensureViewAttributeAvailability({
                view: "target-view",
                field: "x",
                locus: 5,
            })
            .then(() => {
                resolved = true;
            });

        await Promise.resolve();
        expect(zoomTo).toHaveBeenCalledTimes(2);
        expect(resolved).toBe(false);

        zoom.resolve();
        await zoom.promise;
        await Promise.resolve();
        expect(resolved).toBe(false);

        view.handleBroadcast({
            type: "subtreeDataReady",
            payload: { subtreeRoot: view },
        });

        await ensurePromise;
        expect(resolved).toBe(true);
    });

    it("skips zoom for categorical x scales and still awaits subtree readiness", async () => {
        /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */
        const spec = {
            data: {
                values: [{ sample: "S1", category: "A" }],
            },
            samples: {},
            spec: {
                name: "target-view",
                mark: "rect",
                encoding: {
                    sample: { field: "sample" },
                    x: { field: "category", type: "nominal" },
                },
            },
        };

        const { view } = await createSampleViewForTest({
            spec,
            initializeFlow: false,
        });

        // Prevent sample extraction from running during subtree readiness.
        view.getSamples = () =>
            /** @type {any} */ ([
                { id: "dummy", displayName: "dummy", indexNumber: 0 },
            ]);

        const target = view.findDescendantByName("target-view");
        target.getScaleResolution = () =>
            /** @type {any} */ ({
                getScale: () => ({ type: "band" }),
                getDomain: () => ["A", "B"],
            });

        let resolved = false;
        const ensurePromise = view
            .ensureViewAttributeAvailability({
                view: "target-view",
                field: "category",
                locus: "A",
            })
            .then(() => {
                resolved = true;
            });

        await Promise.resolve();
        expect(resolved).toBe(false);

        view.handleBroadcast({
            type: "subtreeDataReady",
            payload: { subtreeRoot: view },
        });

        await ensurePromise;
        expect(resolved).toBe(true);
    });
});
