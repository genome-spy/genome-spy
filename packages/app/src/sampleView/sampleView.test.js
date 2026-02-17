// @ts-check
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
    test("warns once when deprecated legacy sample metadata fields are used", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */
        const spec = {
            data: {
                values: [
                    { sample: "A", x: 1 },
                    { sample: "B", x: 2 },
                ],
            },
            samples: {
                data: {
                    values: [
                        { sample: "A", clinical: "yes" },
                        { sample: "B", clinical: "no" },
                    ],
                },
            },
            spec: {
                mark: "point",
                encoding: {
                    sample: { field: "sample" },
                    x: { field: "x", type: "quantitative" },
                },
            },
        };

        await createSampleViewForTest({
            spec,
            disableGroupUpdates: true,
        });

        expect(warnSpy).toHaveBeenCalledTimes(1);
        warnSpy.mockRestore();
    });

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
            /** @type {any} */ ({
                getDataDomain: () => ["A", "B"],
            });

        // Guard that subtree readiness triggers sample extraction when no metadata ids exist.
        view.handleBroadcast({
            type: "subtreeDataReady",
            payload: { subtreeRoot: view },
        });

        const state = store.getState().provenance.present?.[SAMPLE_SLICE_NAME];
        expect(state?.sampleData?.ids).toEqual(["A", "B"]);
    });

    test("loads sample ids from samples.identity when configured", async () => {
        /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */
        const spec = {
            data: {
                values: [
                    { sample: "A", x: 1 },
                    { sample: "B", x: 2 },
                ],
            },
            samples: {
                identity: {
                    data: {
                        values: [
                            { sid: "B", label: "Sample B" },
                            { sid: "A", label: "Sample A" },
                        ],
                    },
                    idField: "sid",
                    displayNameField: "label",
                },
            },
            spec: {
                mark: "point",
                encoding: {
                    sample: { field: "sample" },
                    x: { field: "x", type: "quantitative" },
                },
            },
        };

        const { context, store } = await createSampleViewForTest({
            spec,
            disableGroupUpdates: true,
        });

        await Promise.all(
            context.dataFlow.dataSources
                .filter((source) => source.constructor.name !== "NamedSource")
                .map((source) => source.load())
        );

        const state = store.getState().provenance.present?.[SAMPLE_SLICE_NAME];
        expect(state?.sampleData?.ids).toEqual(["B", "A"]);
        expect(state?.sampleData?.entities.B.displayName).toBe("Sample B");
        expect(state?.sampleData?.entities.A.displayName).toBe("Sample A");
    });
});
