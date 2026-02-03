import { describe, expect, it, vi } from "vitest";

vi.mock("@fortawesome/fontawesome-svg-core", () => ({
    icon: () => ({ node: [""] }),
    dom: { css: () => "" },
}));

vi.mock("@fortawesome/free-solid-svg-icons", async (importOriginal) => ({
    __esModule: true,
    ...(await importOriginal()),
}));

import { createSampleViewForTest } from "../testUtils/appTestUtils.js";

describe("SampleView lazy readiness", () => {
    it("waits for mock lazy data before resolving ensureViewAttributeAvailability", async () => {
        vi.useFakeTimers();

        try {
            // Non-obvious: use fake timers to control the mock lazy delay.
            /** @type {import("@genome-spy/core/spec/sampleView.js").SampleSpec} */
            const spec = {
                samples: {
                    data: {
                        values: [{ sample: "A" }, { sample: "B" }],
                    },
                },
                data: {
                    lazy: {
                        type: "mockLazy",
                        channel: "x",
                        delay: 50,
                        data: [
                            { sample: "A", x: 1, beta: 1 },
                            { sample: "B", x: 2, beta: 2 },
                        ],
                    },
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

            const ensurePromise = view.ensureViewAttributeAvailability({
                view: "beta-values",
                field: "beta",
                interval: [0, 10],
            });

            let resolved = false;
            ensurePromise.then(() => {
                resolved = true;
            });

            await vi.advanceTimersByTimeAsync(49);
            await Promise.resolve();
            expect(resolved).toBe(false);

            await vi.advanceTimersByTimeAsync(1);
            await expect(ensurePromise).resolves.toBeUndefined();
        } finally {
            vi.useRealTimers();
        }
    });
});
