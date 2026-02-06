import { describe, expect, it, vi } from "vitest";

vi.mock("@fortawesome/fontawesome-svg-core", () => ({
    icon: () => ({ node: [""] }),
    dom: { css: () => "" },
}));

vi.mock("@fortawesome/free-solid-svg-icons", async (importOriginal) => ({
    __esModule: true,
    ...(await importOriginal()),
}));

import {
    buildReadinessRequest,
    isSubtreeLazyReady,
} from "@genome-spy/core/view/dataReadiness.js";
import { registerLazyDataSource } from "@genome-spy/core/data/sources/dataSourceFactory.js";
import MockLazySource from "@genome-spy/core/data/sources/lazy/mockLazySource.js";
import { createSampleViewForTest } from "../testUtils/appTestUtils.js";

describe("SampleView lazy readiness", () => {
    // This test is intentionally headless: it validates the async readiness
    // contract without spinning up the full app or rendering pipeline.
    it("waits for mock lazy data before resolving ensureViewAttributeAvailability", async () => {
        vi.useFakeTimers();
        /** @type {() => void} */
        let unregister;

        try {
            // Non-obvious: use fake timers to control the mock lazy delay.
            unregister = registerLazyDataSource(
                (params) => params?.type === "mockLazy",
                MockLazySource
            );

            /** @type {import("@genome-spy/core/spec/testing.js").MockLazyData} */
            const lazySource = {
                type: "mockLazy",
                channel: "x",
                delay: 50,
                data: [
                    { sample: "A", x: 1, beta: 1 },
                    { sample: "B", x: 2, beta: 2 },
                ],
            };

            /** @type {import("@genome-spy/core/spec/sampleView.js").SampleSpec} */
            const spec = {
                samples: {
                    data: {
                        values: [{ sample: "A" }, { sample: "B" }],
                    },
                },
                data: {
                    lazy: /** @type {import("@genome-spy/core/spec/data.js").LazyDataParams} */ (
                        /** @type {unknown} */ (lazySource)
                    ),
                },
                spec: {
                    name: "beta-values",
                    mark: "point",
                    encoding: {
                        sample: { field: "sample" },
                        x: { field: "x", type: "quantitative" },
                        y: { field: "beta", type: "quantitative" },
                    },
                },
            };

            const { view } = await createSampleViewForTest({
                spec,
                disableGroupUpdates: true,
            });

            const trackView = view.findDescendantByName("beta-values");
            expect(trackView).toBeDefined();

            // This asserts the integration between SampleView's ensure step
            // (view visibility + zoom) and the lazy source readiness wait.
            const ensurePromise = view.ensureViewAttributeAvailability({
                view: "beta-values",
                field: "beta",
                interval: [0, 10],
            });

            let resolved = false;
            ensurePromise.then(() => {
                resolved = true;
            });

            const readinessRequest = buildReadinessRequest(trackView, ["x"]);
            expect(readinessRequest).toBeDefined();
            expect(isSubtreeLazyReady(trackView, readinessRequest)).toBe(false);

            // Before the mock lazy delay elapses, readiness should not resolve.
            await vi.advanceTimersByTimeAsync(49);
            await Promise.resolve();
            expect(resolved).toBe(false);

            // After the delay, the lazy source publishes data and readiness resolves.
            await vi.advanceTimersByTimeAsync(1);
            await expect(ensurePromise).resolves.toBeUndefined();

            // After readiness resolves, the collector has completed and the
            // subtree is ready for the current x-domain.
            const collector = trackView.getCollector();
            expect(collector).toBeDefined();
            expect(collector.completed).toBe(true);
            expect(isSubtreeLazyReady(trackView, readinessRequest)).toBe(true);
        } finally {
            if (unregister) {
                unregister();
            }
            vi.useRealTimers();
        }
    });

    it("rejects ensureViewAttributeAvailability when interval source selector cannot be resolved", async () => {
        /** @type {import("@genome-spy/core/spec/sampleView.js").SampleSpec} */
        const spec = {
            samples: {
                data: {
                    values: [{ sample: "A" }],
                },
            },
            data: {
                values: [{ sample: "A", x: 1, beta: 1 }],
            },
            spec: {
                name: "beta-values",
                mark: "point",
                encoding: {
                    sample: { field: "sample" },
                    x: { field: "x", type: "quantitative" },
                    y: { field: "beta", type: "quantitative" },
                },
            },
        };

        const { view } = await createSampleViewForTest({
            spec,
            disableGroupUpdates: true,
        });

        await expect(
            view.ensureViewAttributeAvailability({
                view: "beta-values",
                field: "beta",
                interval: {
                    type: "selection",
                    selector: { scope: [], param: "brush" },
                },
                aggregation: { op: "count" },
            })
        ).rejects.toThrow('Cannot resolve interval source selection "brush"');
    });

    it("rejects ensureViewAttributeAvailability when interval source selection is empty", async () => {
        /** @type {import("@genome-spy/core/spec/sampleView.js").SampleSpec} */
        const spec = {
            samples: {
                data: {
                    values: [{ sample: "A" }],
                },
            },
            data: {
                values: [{ sample: "A", x: 1, beta: 1 }],
            },
            spec: {
                name: "beta-values",
                params: [
                    {
                        name: "brush",
                        select: { type: "interval", encodings: ["x"] },
                    },
                ],
                mark: "point",
                encoding: {
                    sample: { field: "sample" },
                    x: { field: "x", type: "quantitative" },
                    y: { field: "beta", type: "quantitative" },
                },
            },
        };

        const { view } = await createSampleViewForTest({
            spec,
            disableGroupUpdates: true,
        });

        await expect(
            view.ensureViewAttributeAvailability({
                view: "beta-values",
                field: "beta",
                interval: {
                    type: "selection",
                    selector: { scope: [], param: "brush" },
                },
                aggregation: { op: "count" },
            })
        ).rejects.toThrow('Interval source selection "brush" is empty');
    });
});
