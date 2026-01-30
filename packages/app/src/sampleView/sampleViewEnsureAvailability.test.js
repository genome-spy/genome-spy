import { describe, expect, it, vi } from "vitest";
import { createSampleViewForTest } from "../testUtils/appTestUtils.js";

vi.mock("@fortawesome/fontawesome-svg-core", () => ({
    icon: () => ({ node: [""] }),
    dom: { css: () => "" },
}));

vi.mock("@fortawesome/free-solid-svg-icons", async (importOriginal) => ({
    __esModule: true,
    ...(await importOriginal()),
}));

/**
 * @returns {{resolve: () => void, promise: Promise<void>}}
 */
function createDeferred() {
    /** @type {() => void} */
    let resolve;
    const promise = new Promise((res) => {
        resolve = res;
    });
    return { resolve, promise };
}

describe("SampleView ensureViewAttributeAvailability", () => {
    it("awaits zoom and subtree readiness before resolving", async () => {
        /** @type {import("@genome-spy/core/spec/sampleView.js").SampleSpec} */
        const spec = {
            data: {
                values: [{ sample: "S1", x: 1 }],
            },
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

        const { view } = await createSampleViewForTest({
            spec,
            initializeFlow: false,
        });

        // Prevent sample extraction from running during subtree readiness.
        view.getSamples = () => ["dummy"];

        const target = view.findDescendantByName("target-view");
        const zoomDeferred = createDeferred();
        const zoomTo = vi.fn(() => zoomDeferred.promise);

        // Non-obvious: patch zoomTo to control the async sequence.
        target.getScaleResolution = () =>
            /** @type {import("@genome-spy/core/types/scaleResolutionApi.js").default} */ ({
                zoomTo,
            });

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
        expect(zoomTo).toHaveBeenCalledTimes(1);
        expect(resolved).toBe(false);

        zoomDeferred.resolve();
        await Promise.resolve();
        expect(resolved).toBe(false);

        view.handleBroadcast({
            type: "subtreeDataReady",
            payload: { subtreeRoot: target },
        });

        await ensurePromise;
        expect(resolved).toBe(true);
    });
});
