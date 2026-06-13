// @ts-check
import { describe, expect, test, vi } from "vitest";
import { ActionCreators } from "redux-undo";
import Interaction from "@genome-spy/core/utils/interaction.js";
import Point from "@genome-spy/core/view/layout/point.js";
import Rectangle from "@genome-spy/core/view/layout/rectangle.js";
import ViewRenderingContext from "@genome-spy/core/view/renderingContext/viewRenderingContext.js";
import AxisView from "@genome-spy/core/view/axisView.js";
import { getNonChromeViews } from "@genome-spy/core/view/viewSelectors.js";
import { initializeVisibleViewData } from "@genome-spy/core/genomeSpy/viewDataInit.js";
import { initializeViewSubtree } from "@genome-spy/core/data/flowInit.js";
import { createTestViewContext } from "@genome-spy/core/view/testUtils.js";
import Collector from "@genome-spy/core/data/collector.js";
import UrlSource from "@genome-spy/core/data/sources/urlSource.js";
import { AUGMENTED_KEY } from "../state/provenanceReducerBuilder.js";
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
    test("marks sidebar and background helper views as chrome", async () => {
        const { view } = await createSampleViewForTest({
            spec: {
                data: {
                    values: [{ sample: "A", x: 1 }],
                },
                samples: {},
                view: {
                    stroke: "red",
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

        const names = getNonChromeViews(/** @type {any} */ (view)).map(
            (v) => v.name
        );

        expect(names).not.toContain("sample-sidebar");
        expect(
            names.some((name) =>
                name.startsWith("sample-group-background-stroke-")
            )
        ).toBe(false);
    });

    test("loads sample metadata from metadataSources without warnings", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */
        const spec = {
            data: {
                values: [
                    { sample: "A", x: 1 },
                    { sample: "B", x: 2 },
                ],
            },
            samples: {},
            metadata: {
                sources: [
                    {
                        backend: {
                            backend: "data",
                            data: {
                                values: [
                                    { sample: "A", clinical: "yes" },
                                    { sample: "B", clinical: "no" },
                                ],
                            },
                        },
                    },
                ],
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

        expect(warnSpy).not.toHaveBeenCalled();
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

    test("publishes visibleSamples from the sample hierarchy", async () => {
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
        const facetsView = view.findDescendantByName("sample-facets");

        expect(facetsView.paramRuntime.findValue("visibleSamples")).toEqual([]);

        view.provenance.store.dispatch(
            view.actions.setSamples({
                samples: [
                    { id: "A", displayName: "A", indexNumber: 0 },
                    { id: "B", displayName: "B", indexNumber: 1 },
                ],
            })
        );
        await Promise.resolve();

        expect(facetsView.paramRuntime.findValue("visibleSamples")).toEqual([
            "A",
            "B",
        ]);
    });

    test("publishes visibleSampleMetadata with lazy hierarchical access", async () => {
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
        const facetsView = view.findDescendantByName("sample-facets");
        const initialMetadata = facetsView.paramRuntime.findValue(
            "visibleSampleMetadata"
        );

        expect(initialMetadata.patient).toEqual([]);
        expect(initialMetadata.Clinical.patientId).toEqual([]);

        view.provenance.store.dispatch(
            view.actions.setSamples({
                samples: [
                    { id: "A", displayName: "A", indexNumber: 0 },
                    { id: "B", displayName: "B", indexNumber: 1 },
                    { id: "C", displayName: "C", indexNumber: 2 },
                ],
            })
        );
        view.provenance.store.dispatch(
            view.actions.addMetadata({
                columnarMetadata: {
                    sample: ["A", "B", "C"],
                    "Clinical/patientId": ["P1", "P1", "P2"],
                    "Clinical/diagnosis": ["AML", "AML", "ALL"],
                    "batch id": ["B1", "B2", ""],
                },
                replace: true,
            })
        );
        await Promise.resolve();

        const metadata = facetsView.paramRuntime.findValue(
            "visibleSampleMetadata"
        );
        expect(metadata["Clinical/patientId"]).toEqual(["P1", "P1", "P2"]);
        expect(metadata.Clinical.patientId).toEqual(["P1", "P1", "P2"]);
        expect(metadata.Clinical.diagnosis).toEqual(["AML", "AML", "ALL"]);
        expect(metadata["batch id"]).toEqual(["B1", "B2"]);
    });

    test("evaluates visibleSampleMetadata in expressions", async () => {
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
        const facetsView = view.findDescendantByName("sample-facets");

        view.provenance.store.dispatch(
            view.actions.setSamples({
                samples: [
                    { id: "A", displayName: "A", indexNumber: 0 },
                    { id: "B", displayName: "B", indexNumber: 1 },
                ],
            })
        );
        view.provenance.store.dispatch(
            view.actions.addMetadata({
                columnarMetadata: {
                    sample: ["A", "B"],
                    "Clinical/patientId": ["P1", "P2"],
                },
                replace: true,
            })
        );
        await Promise.resolve();

        expect(
            facetsView.paramRuntime.createExpression(
                'visibleSampleMetadata["Clinical/patientId"]'
            )()
        ).toEqual(["P1", "P2"]);
        expect(
            facetsView.paramRuntime.createExpression(
                "visibleSampleMetadata.Clinical.patientId"
            )()
        ).toEqual(["P1", "P2"]);
    });

    test("uses visibleSampleMetadata to expand eager URL data partitions", async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = /** @type {any} */ (
            vi.fn(async (url) => {
                if (url == "mutations/P1.tsv") {
                    return new Response("sample\tvalue\nA\t1\nB\t2\n", {
                        status: 200,
                    });
                }
                if (url == "mutations/P2.tsv") {
                    return new Response("sample\tvalue\nC\t3\n", {
                        status: 200,
                    });
                }
                throw new Error("Unexpected URL: " + url);
            })
        );

        try {
            const { view } = await createSampleViewForTest({
                spec: {
                    data: {
                        values: [{ sample: "A", x: 1 }],
                    },
                    samples: {},
                    spec: {
                        name: "mutation-values",
                        mark: "point",
                        encoding: {
                            sample: { field: "sample" },
                            x: { field: "value", type: "quantitative" },
                        },
                    },
                },
            });

            view.provenance.store.dispatch(
                view.actions.setSamples({
                    samples: [
                        { id: "A", displayName: "A", indexNumber: 0 },
                        { id: "B", displayName: "B", indexNumber: 1 },
                        { id: "C", displayName: "C", indexNumber: 2 },
                    ],
                })
            );
            view.provenance.store.dispatch(
                view.actions.addMetadata({
                    columnarMetadata: {
                        sample: ["A", "B", "C"],
                        "Clinical/patientId": ["P1", "P1", "P2"],
                    },
                    replace: true,
                })
            );
            await Promise.resolve();

            const source = new UrlSource(
                {
                    url: {
                        template: "mutations/{patient}.tsv",
                        values: {
                            expr: 'visibleSampleMetadata["Clinical/patientId"]',
                        },
                        field: "patient",
                    },
                    format: { type: "tsv" },
                },
                /** @type {any} */ ({
                    paramRuntime: view.paramRuntime,
                    getBaseUrl: () => "",
                    context: {
                        dataFlow: {
                            loadingStatusRegistry: {
                                set: () => undefined,
                            },
                        },
                    },
                })
            );
            const collector = new Collector();
            source.addChild(collector);
            await source.load();

            expect([...collector.getData()]).toEqual([
                { patient: "P1", sample: "A", value: 1 },
                { patient: "P1", sample: "B", value: 2 },
                { patient: "P2", sample: "C", value: 3 },
            ]);
            expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        } finally {
            globalThis.fetch = originalFetch;
        }
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
            spec: /** @type {any} */ ({
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
            }),
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

    test("collapses the sample group column when no groups are shown", async () => {
        // updateGroups resolves Lit titles through a DOM element in browser builds.
        vi.stubGlobal("document", {
            createElement: () => ({ innerHTML: "", textContent: "" }),
        });

        try {
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
                disableGroupUpdates: false,
            });

            /** @type {any} */ (view.locationManager).getLocations = () => ({
                groups: [
                    {
                        key: {
                            index: 0,
                            depth: 0,
                            n: 1,
                            group: {
                                name: "ROOT",
                                title: "Root",
                                samples: ["A"],
                            },
                        },
                        locSize: { location: 0, size: 20 },
                    },
                ],
            });

            view.sampleGroupView.updateGroups();
            expect(view.sampleGroupView.isVisibleInSpec()).toBe(true);
            expect(view.sampleGroupView.isConfiguredVisible()).toBe(false);

            /** @type {any} */ (view.locationManager).getLocations = () => ({
                groups: [
                    {
                        key: {
                            index: 0,
                            depth: 1,
                            n: 1,
                            group: {
                                name: "group",
                                title: "Group",
                                samples: ["A"],
                            },
                        },
                        locSize: { location: 0, size: 20 },
                    },
                ],
            });

            view.sampleGroupView.updateGroups();
            expect(view.sampleGroupView.isVisibleInSpec()).toBe(true);
            expect(view.sampleGroupView.isConfiguredVisible()).toBe(true);
            expect(view.sampleGroupView.getSize().width.px).toBeGreaterThan(0);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    test("loads when sample labels are initially hidden", async () => {
        let labelsVisible = false;
        const context = createTestViewContext();
        context.isViewConfiguredVisible = (candidate) =>
            candidate.spec.name !== "sample-labels" || labelsVisible;

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
            context,
            initializeFlow: false,
        });
        const coreView =
            /** @type {import("@genome-spy/core/view/view.js").default<any>} */ (
                view
            );
        initializeViewSubtree(coreView, context.dataFlow, (candidate) =>
            candidate.isConfiguredVisible()
        );

        // Mirrors loading a bookmark where the label view is hidden before the
        // first sample-state update arrives.
        expect(view.sampleLabelView.flowHandle).toBeUndefined();
        view.provenance.store.dispatch(
            view.actions.setSamples({
                samples: [{ id: "A", displayName: "A", indexNumber: 0 }],
            })
        );

        labelsVisible = true;
        await initializeVisibleViewData(
            coreView,
            context.dataFlow,
            context.fontManager
        );

        expect(view.sampleLabelView.flowHandle?.collector.getItemCount()).toBe(
            1
        );
    });

    test("reserves sidebar padding when computing main pane coordinates", async () => {
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

        const renderContext = new NoOpRenderingContext({ picking: false });
        view.render(renderContext, Rectangle.create(0, 0, 300, 220), {
            firstFacet: true,
        });

        expect(view.childCoords.x).toBe(view.sidebarCoords.x2);
        expect(view.sidebarCoords.width).toBe(view.getOverhang().left);
    });

    test("counts sidebar width once in the minimum layout size", async () => {
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

        const renderContext = new NoOpRenderingContext({ picking: false });
        view.render(renderContext, Rectangle.create(0, 0, 300, 220), {
            firstFacet: true,
        });

        // GridView combines content size and overhang when reserving space.
        expect((view.getSize().width.px ?? 0) + view.getOverhang().left).toBe(
            view.sidebarCoords.width
        );
        expect(view.getOverhang().left).toBe(view.sidebarCoords.width);
    });

    test("sample group column separates levels without outer padding", async () => {
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

        const scale = /** @type {any} */ (view.sampleGroupView.spec).encoding.x
            .scale;

        expect(scale.paddingInner).toBeGreaterThan(0);
        expect(scale.paddingOuter).toBe(0);
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

    test("uses sibling sampleLayout for peek sample height", async () => {
        /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */
        const spec = {
            data: {
                values: [
                    { sample: "A", x: 1 },
                    { sample: "B", x: 2 },
                    { sample: "C", x: 3 },
                ],
            },
            samples: {},
            sampleLayout: {
                sampleHeight: 25,
            },
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
                getDataDomain: () => ["A", "B", "C"],
            });
        view.handleBroadcast({
            type: "subtreeDataReady",
            payload: { subtreeRoot: view },
        });

        const renderContext = new NoOpRenderingContext({ picking: false });
        view.render(renderContext, Rectangle.create(0, 0, 300, 220), {
            firstFacet: true,
        });

        expect(view.locationManager.getScrollableHeight()).toBe(75);
    });

    test("sidebar wheel and drag do not start sample-pane zoom interactions", async () => {
        const originalMouseEvent = globalThis.MouseEvent;

        try {
            class FakeMouseEvent extends Event {
                constructor(
                    /** @type {string} */ type,
                    /** @type {Record<string, any>} */ init = {}
                ) {
                    super(type);
                    Object.assign(this, init);
                }
            }

            globalThis.MouseEvent = /** @type {typeof MouseEvent} */ (
                /** @type {any} */ (FakeMouseEvent)
            );

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
                        x: {
                            field: "x",
                            type: "quantitative",
                            scale: { zoom: true },
                        },
                    },
                },
            };

            const { view, context } = await createSampleViewForTest({
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

            const point = new Point(
                view.sidebarCoords.x + view.sidebarCoords.width / 2,
                view.sidebarCoords.y + view.sidebarCoords.height / 2
            );

            const wheelPreventDefault = vi.fn();
            const suspendHoverTracking = vi.spyOn(
                context,
                "suspendHoverTracking"
            );

            view.propagateInteraction(
                new Interaction(
                    point,
                    /** @type {any} */ ({
                        type: "wheel",
                        deltaX: 0,
                        deltaY: -120,
                        deltaMode: 0,
                        preventDefault: wheelPreventDefault,
                    })
                )
            );

            view.propagateInteraction(
                new Interaction(
                    point,
                    /** @type {any} */ (
                        new FakeMouseEvent("mousedown", {
                            button: 0,
                            clientX: point.x,
                            clientY: point.y,
                            preventDefault: vi.fn(),
                        })
                    )
                )
            );

            expect(wheelPreventDefault).not.toHaveBeenCalled();
            expect(suspendHoverTracking).not.toHaveBeenCalled();
        } finally {
            globalThis.MouseEvent = originalMouseEvent;
        }
    });

    test("main-pane axis wheel zoom matches content zoom", async () => {
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
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { zoom: true },
                    },
                },
            },
        };

        const axisHarness = await createSampleViewForTest({ spec });
        const contentHarness = await createSampleViewForTest({ spec });

        for (const { view } of [axisHarness, contentHarness]) {
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
        }

        const axisView = axisHarness.view
            .getDescendants()
            .find(
                (view) =>
                    view instanceof AxisView &&
                    (view.axisProps.orient === "top" ||
                        view.axisProps.orient === "bottom")
            );
        if (!(axisView instanceof AxisView)) {
            throw new Error("Expected sample-pane axis view!");
        }

        const contentAxisView = contentHarness.view
            .getDescendants()
            .find(
                (view) =>
                    view instanceof AxisView &&
                    (view.axisProps.orient === "top" ||
                        view.axisProps.orient === "bottom")
            );
        if (!(contentAxisView instanceof AxisView)) {
            throw new Error("Expected content-harness axis view!");
        }

        const axisPoint = new Point(
            axisView.coords.x + axisView.coords.width / 2,
            axisView.coords.y + axisView.coords.height / 2
        );
        const contentPoint = new Point(
            contentHarness.view.childCoords.x +
                contentHarness.view.childCoords.width / 2,
            contentHarness.view.childCoords.y +
                contentHarness.view.childCoords.height / 2
        );

        const axisResolution = axisView.dataParent.getScaleResolution("x");
        const contentResolution =
            contentAxisView.dataParent.getScaleResolution("x");
        if (!axisResolution || !contentResolution) {
            throw new Error("Expected zoomable x resolutions!");
        }

        const axisZoomSpy = vi
            .spyOn(axisResolution, "zoom")
            .mockReturnValue(true);
        const contentZoomSpy = vi
            .spyOn(contentResolution, "zoom")
            .mockReturnValue(true);

        axisHarness.view.propagateInteraction(
            new Interaction(
                axisPoint,
                /** @type {any} */ ({
                    type: "wheel",
                    deltaX: 0,
                    deltaY: -120,
                    deltaMode: 0,
                    preventDefault: vi.fn(),
                })
            )
        );

        contentHarness.view.propagateInteraction(
            new Interaction(
                contentPoint,
                /** @type {any} */ ({
                    type: "wheel",
                    deltaX: 0,
                    deltaY: -120,
                    deltaMode: 0,
                    preventDefault: vi.fn(),
                })
            )
        );

        expect(axisZoomSpy).toHaveBeenCalledTimes(1);
        expect(contentZoomSpy).toHaveBeenCalledTimes(1);
        expect(axisZoomSpy.mock.calls[0]).toEqual(contentZoomSpy.mock.calls[0]);
    });

    test("does not render vertical spec axes through the pane-level axis path by default", async () => {
        /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */
        const spec = {
            data: {
                values: [{ sample: "A", x: 1, y: 2 }],
            },
            samples: {},
            spec: {
                mark: "point",
                encoding: {
                    sample: { field: "sample" },
                    x: { field: "x", type: "quantitative" },
                    y: {
                        field: "y",
                        type: "quantitative",
                        axis: { orient: "left" },
                    },
                },
            },
        };

        const { view } = await createSampleViewForTest({ spec });
        const renderContext = new NoOpRenderingContext({ picking: false });

        view.render(renderContext, Rectangle.create(0, 0, 300, 220), {
            firstFacet: true,
        });

        const verticalAxisView = view
            .getDescendants()
            .find(
                (descendant) =>
                    descendant instanceof AxisView &&
                    descendant.axisProps.orient === "left"
            );

        expect(verticalAxisView).toBeInstanceOf(AxisView);
        expect(verticalAxisView.coords).toBeUndefined();
        expect(view.sidebarCoords.x).toBe(0);
        expect(view.getOverhang().left).toBe(view.sidebarCoords.width);
    });

    test("reserves a lane between the sidebar and sample plot for an enabled left spec y-axis", async () => {
        /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */
        const spec = {
            data: {
                values: [{ sample: "A", x: 1, y: 2 }],
            },
            samples: {},
            specYAxis: {
                mode: "middle",
                minSampleHeight: 1,
            },
            spec: {
                height: 160,
                mark: "point",
                encoding: {
                    sample: { field: "sample" },
                    x: { field: "x", type: "quantitative" },
                    y: {
                        field: "y",
                        type: "quantitative",
                        axis: { orient: "left" },
                    },
                },
            },
        };

        const { view } = await createSampleViewForTest({ spec });
        view.provenance.store.dispatch(
            view.actions.setSamples({
                samples: [{ id: "A", displayName: "A", indexNumber: 0 }],
            })
        );
        await Promise.resolve();
        view.sampleGroupView.updateGroups();

        const renderContext = new NoOpRenderingContext({ picking: false });

        view.render(renderContext, Rectangle.create(0, 0, 300, 220), {
            firstFacet: true,
        });

        const verticalAxisView = view
            .getDescendants()
            .find(
                (descendant) =>
                    descendant instanceof AxisView &&
                    descendant.axisProps.orient === "left"
            );
        if (!(verticalAxisView instanceof AxisView)) {
            throw new Error("Expected vertical axis view!");
        }

        const reserve =
            verticalAxisView.getPerpendicularSize() +
            (verticalAxisView.axisProps.offset ?? 0);

        expect(view.childCoords.x).toBe(view.sidebarCoords.x2 + reserve);
        expect(view.childCoords.x).toBe(view.getOverhang().left);
    });

    test("drops left spec y-axis overhang before rendering samples below the height threshold", async () => {
        /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */
        const spec = {
            data: {
                values: [
                    { sample: "A", x: 1, y: 2 },
                    { sample: "B", x: 2, y: 3 },
                    { sample: "C", x: 3, y: 4 },
                ],
            },
            samples: {},
            specYAxis: {
                mode: "all",
                minSampleHeight: 50,
            },
            spec: {
                mark: "point",
                encoding: {
                    sample: { field: "sample" },
                    x: { field: "x", type: "quantitative" },
                    y: {
                        field: "y",
                        type: "quantitative",
                        axis: { orient: "left" },
                    },
                },
            },
        };

        const { view } = await createSampleViewForTest({ spec });
        view.provenance.store.dispatch(
            view.actions.setSamples({
                samples: [
                    { id: "A", displayName: "A", indexNumber: 0 },
                    { id: "B", displayName: "B", indexNumber: 1 },
                    { id: "C", displayName: "C", indexNumber: 2 },
                ],
            })
        );
        await Promise.resolve();
        view.sampleGroupView.updateGroups();

        const renderContext = new NoOpRenderingContext({ picking: false });

        view.render(renderContext, Rectangle.create(0, 0, 300, 300), {
            firstFacet: true,
        });

        expect(view.getOverhang().left).toBeGreaterThan(
            view.sidebarCoords.width
        );

        view.prepareLayoutSize(300, 120);

        expect(view.getOverhang().left).toBe(view.sidebarCoords.width);
    });

    test("invalidates size cache when filtering may change spec y-axis overhang", async () => {
        /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */
        const spec = {
            data: {
                values: [
                    { sample: "A", x: 1, y: 2 },
                    { sample: "B", x: 2, y: 3 },
                    { sample: "C", x: 3, y: 4 },
                    { sample: "D", x: 4, y: 5 },
                ],
            },
            samples: {},
            specYAxis: {
                mode: "all",
                minSampleHeight: 50,
            },
            spec: {
                mark: "point",
                encoding: {
                    sample: { field: "sample" },
                    x: { field: "x", type: "quantitative" },
                    y: {
                        field: "y",
                        type: "quantitative",
                        axis: { orient: "left" },
                    },
                },
            },
        };

        const { view } = await createSampleViewForTest({ spec });
        view.provenance.store.dispatch(
            view.actions.setSamples({
                samples: [
                    { id: "A", displayName: "A", indexNumber: 0 },
                    { id: "B", displayName: "B", indexNumber: 1 },
                    { id: "C", displayName: "C", indexNumber: 2 },
                    { id: "D", displayName: "D", indexNumber: 3 },
                ],
            })
        );
        await Promise.resolve();
        view.sampleGroupView.updateGroups();

        const renderContext = new NoOpRenderingContext({ picking: false });
        view.render(renderContext, Rectangle.create(0, 0, 300, 220), {
            firstFacet: true,
        });

        expect(view.getOverhang().left).toBe(view.sidebarCoords.width);

        const invalidateSizeCacheSpy = vi.spyOn(view, "invalidateSizeCache");
        view.provenance.store.dispatch(
            view.actions.filterByNominal({
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "keep",
                },
                values: ["yes"],
                [AUGMENTED_KEY]: {
                    values: {
                        A: "yes",
                        B: "no",
                        C: "no",
                        D: "no",
                    },
                },
            })
        );
        await Promise.resolve();
        view.sampleGroupView.updateGroups();

        expect(invalidateSizeCacheSpy).toHaveBeenCalled();
        expect(view.getOverhang().left).toBeGreaterThan(
            view.sidebarCoords.width
        );
    });

    test("uses the visible layer candidate for a repeated sample y-axis", async () => {
        /** @type {string | undefined} */
        let visibleLayerName;
        const context = createTestViewContext();
        // Create both axis candidates first, then toggle effective visibility.
        context.isViewConfiguredVisible = (candidate) =>
            !["signal-a", "signal-b"].includes(candidate.spec.name) ||
            !visibleLayerName ||
            candidate.spec.name === visibleLayerName;

        /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */
        const spec = {
            data: {
                values: [{ sample: "A", x: 1, a: 2, b: 3 }],
            },
            samples: {},
            specYAxis: {
                mode: "middle",
                minSampleHeight: 1,
            },
            spec: {
                height: 160,
                resolve: {
                    axis: { y: "independent" },
                    scale: { y: "independent" },
                },
                layer: [
                    {
                        name: "signal-a",
                        mark: "point",
                        encoding: {
                            sample: { field: "sample" },
                            x: { field: "x", type: "quantitative" },
                            y: {
                                field: "a",
                                type: "quantitative",
                                axis: { orient: "left", title: "A" },
                            },
                        },
                    },
                    {
                        name: "signal-b",
                        mark: "point",
                        encoding: {
                            sample: { field: "sample" },
                            x: { field: "x", type: "quantitative" },
                            y: {
                                field: "b",
                                type: "quantitative",
                                axis: { orient: "left", title: "B" },
                            },
                        },
                    },
                ],
            },
        };

        const { view } = await createSampleViewForTest({ spec, context });
        view.provenance.store.dispatch(
            view.actions.setSamples({
                samples: [{ id: "A", displayName: "A", indexNumber: 0 }],
            })
        );
        await Promise.resolve();
        view.sampleGroupView.updateGroups();

        const renderContext = new NoOpRenderingContext({ picking: false });

        visibleLayerName = "signal-a";
        view.render(renderContext, Rectangle.create(0, 0, 300, 220), {
            firstFacet: true,
        });

        const yAxes = view
            .getDescendants()
            .filter(
                (descendant) =>
                    descendant instanceof AxisView &&
                    descendant.axisProps.orient === "left"
            );

        expect(yAxes).toHaveLength(2);
        const axisA = yAxes.find((axis) => axis.axisProps.title === "A");
        const axisB = yAxes.find((axis) => axis.axisProps.title === "B");
        if (!(axisA instanceof AxisView) || !(axisB instanceof AxisView)) {
            throw new Error("Expected both layer y-axis candidates!");
        }

        const renderASpy = vi.spyOn(axisA, "render");
        const renderBSpy = vi.spyOn(axisB, "render");

        expect(axisA.coords).toBeDefined();
        expect(axisB.coords).toBeUndefined();

        visibleLayerName = "signal-b";
        renderASpy.mockClear();
        renderBSpy.mockClear();
        view.invalidateSizeCache();
        view.render(renderContext, Rectangle.create(0, 0, 300, 220), {
            firstFacet: true,
        });

        expect(renderASpy).not.toHaveBeenCalled();
        expect(renderBSpy).toHaveBeenCalled();
    });

    test("renders a repeated y-axis when an initially hidden layer becomes visible", async () => {
        let signalBVisible = false;
        const context = createTestViewContext();
        context.isViewConfiguredVisible = (candidate) =>
            candidate.spec.name !== "signal-b" || signalBVisible;

        /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */
        const spec = {
            data: {
                values: [{ sample: "A", x: 1, a: 2, b: 3 }],
            },
            samples: {},
            specYAxis: {
                mode: "middle",
                minSampleHeight: 1,
            },
            spec: {
                height: 160,
                resolve: {
                    axis: { y: "independent" },
                    scale: { y: "independent" },
                },
                layer: [
                    {
                        name: "signal-a",
                        mark: "point",
                        encoding: {
                            sample: { field: "sample" },
                            x: { field: "x", type: "quantitative" },
                            y: {
                                field: "a",
                                type: "quantitative",
                                axis: { orient: "left", title: "A" },
                            },
                        },
                    },
                    {
                        name: "signal-b",
                        mark: "point",
                        encoding: {
                            sample: { field: "sample" },
                            x: { field: "x", type: "quantitative" },
                            y: {
                                field: "b",
                                type: "quantitative",
                                axis: { orient: "left", title: "B" },
                            },
                        },
                    },
                ],
            },
        };

        const { view } = await createSampleViewForTest({ spec, context });
        view.provenance.store.dispatch(
            view.actions.setSamples({
                samples: [{ id: "A", displayName: "A", indexNumber: 0 }],
            })
        );
        await Promise.resolve();
        view.sampleGroupView.updateGroups();

        const yAxes = view
            .getDescendants()
            .filter(
                (descendant) =>
                    descendant instanceof AxisView &&
                    descendant.axisProps.orient === "left"
            );

        expect(yAxes.map((axis) => axis.axisProps.title)).toEqual(["A", "B"]);
        const axisB = yAxes.find((axis) => axis.axisProps.title === "B");
        if (!(axisB instanceof AxisView)) {
            throw new Error("Expected initially hidden layer axis!");
        }

        const renderContext = new NoOpRenderingContext({ picking: false });
        view.render(renderContext, Rectangle.create(0, 0, 300, 220), {
            firstFacet: true,
        });

        expect(axisB.coords).toBeUndefined();

        signalBVisible = true;
        await initializeVisibleViewData(
            view,
            context.dataFlow,
            context.fontManager
        );

        const renderBSpy = vi.spyOn(axisB, "render");
        view.render(renderContext, Rectangle.create(0, 0, 300, 220), {
            firstFacet: true,
        });

        expect(renderBSpy).toHaveBeenCalled();
    });
});
