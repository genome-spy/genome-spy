// @ts-check
import { describe, expect, test, vi } from "vitest";
import { ActionCreators } from "redux-undo";
import Interaction from "@genome-spy/core/utils/interaction.js";
import Point from "@genome-spy/core/view/layout/point.js";
import Rectangle from "@genome-spy/core/view/layout/rectangle.js";
import ViewRenderingContext from "@genome-spy/core/view/renderingContext/viewRenderingContext.js";
import { createSampleViewForTest } from "../testUtils/appTestUtils.js";
import Provenance from "../state/provenance.js";
import { SAMPLE_SLICE_NAME } from "./state/sampleSlice.js";

class NoOpRenderingContext extends ViewRenderingContext {
    /**
     * @param {import("@genome-spy/core/types/rendering.js").GlobalRenderingOptions} options
     */
    constructor(options) {
        super(options);
    }

    pushView() {
        //
    }

    popView() {
        //
    }

    renderMark() {
        //
    }
}

/**
 * @param {import("@genome-spy/app/spec/sampleView.js").SampleSpec} spec
 * @param {import("./state/sampleState.js").Sample[]} samples
 */
async function getSampleLabelWidth(spec, samples) {
    const { view } = await createSampleViewForTest({
        spec,
    });

    // Drive the same store update path that the production sample loader uses.
    view.provenance.store.dispatch(view.actions.setSamples({ samples }));

    return view.sampleLabelView.getSize().width.px;
}

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

        const provenance = new Provenance(store);
        expect(provenance.getBookmarkableActionHistory()).toEqual([]);
        expect(provenance.isUndoable()).toBe(false);
    });

    test("infers sample label width from the longest display name", async () => {
        const shortWidth = await getSampleLabelWidth(
            {
                data: {
                    values: [{ sample: "A", x: 1 }],
                },
                samples: {},
                spec: {
                    mark: "point",
                    encoding: {
                        sample: { field: "sample" },
                        x: { field: "x", type: "quantitative" },
                    },
                },
            },
            [
                { id: "A", displayName: "A", indexNumber: 0 },
                { id: "B", displayName: "BB", indexNumber: 1 },
            ]
        );

        const longWidth = await getSampleLabelWidth(
            {
                data: {
                    values: [{ sample: "A", x: 1 }],
                },
                samples: {},
                spec: {
                    mark: "point",
                    encoding: {
                        sample: { field: "sample" },
                        x: { field: "x", type: "quantitative" },
                    },
                },
            },
            [
                {
                    id: "A",
                    displayName: "Very long sample label",
                    indexNumber: 0,
                },
                {
                    id: "B",
                    displayName: "Another much longer sample label",
                    indexNumber: 1,
                },
            ]
        );

        expect(longWidth).toBeGreaterThan(shortWidth);
    });

    test("hides the sample label title when labelTitle is null", async () => {
        const { view } = await createSampleViewForTest({
            spec: {
                data: {
                    values: [{ sample: "A", x: 1 }],
                },
                samples: {
                    labelTitle: null,
                },
                spec: {
                    mark: "point",
                    encoding: {
                        sample: { field: "sample" },
                        x: { field: "x", type: "quantitative" },
                    },
                },
            },
        });

        expect(view.sampleLabelView.spec.title).toBeUndefined();
    });

    test("uses Sample as the default sample label title", async () => {
        const { view } = await createSampleViewForTest({
            spec: {
                data: {
                    values: [{ sample: "A", x: 1 }],
                },
                samples: {},
                spec: {
                    mark: "point",
                    encoding: {
                        sample: { field: "sample" },
                        x: { field: "x", type: "quantitative" },
                    },
                },
            },
        });

        expect(view.sampleLabelView.spec.title).toMatchObject({
            text: "Sample",
        });
    });

    test("keeps the legacy labelTitleText alias working", async () => {
        const { view } = await createSampleViewForTest({
            spec: {
                data: {
                    values: [{ sample: "A", x: 1 }],
                },
                samples: {
                    labelTitleText: "Legacy title",
                },
                spec: {
                    mark: "point",
                    encoding: {
                        sample: { field: "sample" },
                        x: { field: "x", type: "quantitative" },
                    },
                },
            },
        });

        expect(view.sampleLabelView.spec.title).toMatchObject({
            text: "Legacy title",
        });
    });

    test("keeps an explicit sample label width override", async () => {
        const width = await getSampleLabelWidth(
            {
                data: {
                    values: [{ sample: "A", x: 1 }],
                },
                samples: {
                    labelLength: 222,
                },
                spec: {
                    mark: "point",
                    encoding: {
                        sample: { field: "sample" },
                        x: { field: "x", type: "quantitative" },
                    },
                },
            },
            [
                {
                    id: "A",
                    displayName: "A very long sample label",
                    indexNumber: 0,
                },
                {
                    id: "B",
                    displayName: "Another even longer sample label",
                    indexNumber: 1,
                },
            ]
        );

        expect(width).toBe(222);
    });

    test("handles provenance rewind while sample labels are subscribed", async () => {
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
        });

        // Non-obvious: trigger sample extraction before rewinding provenance,
        // which matches the bookmark restore sequence that used to fail.
        view.getScaleResolution = () =>
            /** @type {any} */ ({
                getDataDomain: () => ["A", "B"],
            });
        view.handleBroadcast({
            type: "subtreeDataReady",
            payload: { subtreeRoot: view },
        });

        expect(() =>
            store.dispatch(ActionCreators.jumpToPast(0))
        ).not.toThrow();
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

    test("keeps context-menu peek focus at the pointer after mouseleave", async () => {
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
                height: 160,
                mark: "point",
                encoding: {
                    sample: { field: "sample" },
                    x: { field: "x", type: "quantitative" },
                },
            },
        };

        const { view } = await createSampleViewForTest({
            spec,
        });

        view.getScaleResolution = () =>
            /** @type {any} */ ({
                getDataDomain: () => ["A", "B"],
            });
        view.handleBroadcast({
            type: "subtreeDataReady",
            payload: { subtreeRoot: view },
        });

        const renderContext = new NoOpRenderingContext({ picking: false });
        view.render(renderContext, Rectangle.create(0, 0, 300, 220), {
            firstFacet: true,
        });

        const sampleLocations = view.locationManager.getLocations().samples;
        const first = sampleLocations[0].locSize;
        const second = sampleLocations[1].locSize;
        const gapY = first.location + first.size + 1;
        const point = new Point(
            view.childCoords.x + view.childCoords.width / 2,
            view.childCoords.y + gapY
        );

        const togglePeekSpy = vi
            .spyOn(view.locationManager, "togglePeek")
            .mockImplementation(() => undefined);

        view.propagateInteraction(
            new Interaction(point, /** @type {any} */ ({ type: "mousemove" }))
        );

        const menuItem = view.makePeekMenuItem();

        view.propagateInteraction(
            new Interaction(point, /** @type {any} */ ({ type: "mouseleave" }))
        );

        menuItem.callback();

        expect(togglePeekSpy).toHaveBeenCalledWith(
            undefined,
            gapY,
            sampleLocations[0].key
        );
        expect(gapY).toBeLessThan(second.location);
    });
});
