import { describe, expect, test, vi } from "vitest";

vi.mock("@fortawesome/fontawesome-svg-core", () => ({
    icon: () => ({ node: [""] }),
    dom: { css: () => "" },
}));

vi.mock("@fortawesome/free-solid-svg-icons", async (importOriginal) => ({
    __esModule: true,
    ...(await importOriginal()),
}));
import { createTestViewContext } from "@genome-spy/core/view/testUtils.js";
import { initializeViewSubtree } from "@genome-spy/core/data/flowInit.js";
import SampleView from "./sampleView.js";
import setupStore from "../state/setupStore.js";
import IntentExecutor from "../state/intentExecutor.js";
import Provenance from "../state/provenance.js";
import { SAMPLE_SLICE_NAME } from "./state/sampleSlice.js";

describe("SampleView", () => {
    test("extracts samples from main data subtree on subtreeDataReady", async () => {
        const context = createTestViewContext();
        context.animator = {
            transition: () => Promise.resolve(),
            requestRender: () => undefined,
        };
        context.requestLayoutReflow = () => undefined;
        context.updateTooltip = () => undefined;
        context.getCurrentHover = () => undefined;
        context.addKeyboardListener = () => undefined;
        context.addBroadcastListener = () => undefined;
        context.removeBroadcastListener = () => undefined;
        context.setDataLoadingStatus = () => undefined;
        context.glHelper = undefined;

        const store = setupStore();
        const intentExecutor = new IntentExecutor(store);
        const provenance = new Provenance(store, intentExecutor);

        /** @type {import("@genome-spy/core/spec/sampleView.js").SampleSpec} */
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
        initializeViewSubtree(view, context.dataFlow);
        view.sampleGroupView.updateGroups = () => undefined;

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
