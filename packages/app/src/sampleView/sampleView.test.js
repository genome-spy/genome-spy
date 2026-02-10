import { describe, expect, test, vi } from "vitest";

vi.mock("@fortawesome/fontawesome-svg-core", () => ({
    icon: () => ({ node: [""] }),
    dom: { css: () => "" },
}));

vi.mock("@fortawesome/free-solid-svg-icons", async (importOriginal) => ({
    __esModule: true,
    ...(await importOriginal()),
}));
import { createSampleViewForTest } from "../testUtils/appTestUtils.js";
import { SAMPLE_SLICE_NAME } from "./state/sampleSlice.js";

describe("SampleView", () => {
    test("extracts samples from main data subtree on subtreeDataReady", async () => {
        /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */
        const spec = {
            data: {
                values: [
                    { sample: "A", x: 1 },
                    { sample: "B", x: 2 },
                ],
            },
            samples: {},
            spec: {
                mark: "point",
                encoding: {
                    sample: { field: "sample" },
                    x: { field: "x", type: "quantitative" },
                },
            },
        };

        const { view, store } = await createSampleViewForTest({
            spec,
            disableGroupUpdates: true,
        });

        // Ensure sample extraction relies on a predictable domain for the test.
        view.getScaleResolution = () =>
            /** @type {import("@genome-spy/core/view/scaleResolution.js").default} */ (
                /** @type {unknown} */ ({
                    getDataDomain: () => ["A", "B"],
                })
            );

        // Guard that subtree readiness triggers sample extraction when no metadata ids exist.
        view.handleBroadcast({
            type: "subtreeDataReady",
            payload: { subtreeRoot: view },
        });

        const state = store.getState().provenance.present?.[SAMPLE_SLICE_NAME];
        expect(state?.sampleData?.ids).toEqual(["A", "B"]);
    });
});
