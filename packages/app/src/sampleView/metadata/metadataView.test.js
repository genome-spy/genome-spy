// @vitest-environment jsdom
// @ts-check
import { beforeEach, describe, expect, it, vi } from "vitest";

import UnitView from "@genome-spy/core/view/unitView.js";
import Tooltip from "@genome-spy/core/utils/ui/tooltip.js";
import { createTestViewContext } from "@genome-spy/core/view/testUtils.js";
import {
    createSampleViewStub,
    createStoreStub,
} from "../../testUtils/appTestUtils.js";

const contextMenuMocks = vi.hoisted(() => ({
    contextMenu: vi.fn(),
}));

vi.mock("../attributeContextMenu.js", () => ({ default: () => [] }));
vi.mock("../../utils/ui/contextMenu.js", async (importOriginal) => {
    const actual = /** @type {any} */ (await importOriginal());
    return {
        ...actual,
        contextMenu: contextMenuMocks.contextMenu,
    };
});

/**
 * @typedef {object} SampleHierarchyStub
 * @prop {{ attributeNames: string[], attributeDefs: Record<string, any>, entities: Record<string, any> }} sampleMetadata
 * @prop {{ entities: Record<string, { indexNumber: number }> }} sampleData
 */

/**
 * @param {import("./metadataView.js").MetadataView} metadataView
 * @param {import("@genome-spy/core/data/dataFlow.js").default} dataFlow
 */
function assertFlowMatchesSubtree(metadataView, dataFlow) {
    const descendants = metadataView.getDescendants();
    const unitViews = descendants.filter((view) => view instanceof UnitView);
    const collectingUnitViews = unitViews.filter(
        (view) => view.flowHandle?.collector
    );
    const dataSources = new Set(
        descendants
            .map((view) => view.flowHandle?.dataSource)
            .filter((dataSource) => dataSource)
    );
    const collectors = new Set(
        unitViews
            .map((view) => view.flowHandle?.collector)
            .filter((collector) => collector)
    );
    const observerCount = [...collectors].reduce(
        (sum, collector) => sum + collector.observers.size,
        0
    );

    expect(dataFlow.dataSources.length).toBe(dataSources.size);
    expect(dataFlow.collectors.length).toBe(collectors.size);
    expect(observerCount).toBe(collectingUnitViews.length);
}

/**
 * @param {import("@genome-spy/core/view/view.js").default} view
 */
function isMetadataValueUnitView(view) {
    return (
        view instanceof UnitView &&
        !!view.spec.encoding?.color &&
        view.name.endsWith("-value")
    );
}

/**
 * @param {() => boolean} condition
 */
async function waitForCondition(condition) {
    const attempts = 10;
    for (let i = 0; i < attempts; i++) {
        if (condition()) {
            return;
        }
        await Promise.resolve();
    }
    throw new Error("Condition was not met in time.");
}

/**
 * @param {{
 *   metadataDef?: Record<string, any>,
 *   sampleMetadata?: {
 *     attributeNames: string[],
 *     attributeDefs: Record<string, any>,
 *     entities: Record<string, any>,
 *   },
 *   sampleDataEntities?: Record<string, { indexNumber: number }>,
 * }} [options]
 */
async function createMetadataViewTestHarness(options = {}) {
    const { MetadataView } = await import("./metadataView.js");
    const transition = vi.fn(() => Promise.resolve());
    const requestRender = vi.fn();
    const context = createTestViewContext();
    context.animator =
        /** @type {import("@genome-spy/core/utils/animator.js").default} */ (
            /** @type {any} */ ({
                transition,
                requestRender,
            })
        );
    context.requestLayoutReflow = () => undefined;
    context.updateTooltip = () => undefined;
    context.getCurrentHover = () => undefined;
    context.addKeyboardListener = () => undefined;
    context.getNamedDataFromProvider = () => [];

    const store = createStoreStub({
        provenance: {
            present: {
                sampleView: {
                    sampleMetadata: {
                        attributeNames: [],
                        attributeDefs: {},
                        entities: {},
                    },
                },
            },
        },
    });

    const sampleMetadata = options.sampleMetadata ?? {
        attributeNames: ["foo", "bar"],
        attributeDefs: {
            foo: { type: "nominal" },
            bar: { type: "nominal" },
        },
        entities: {
            s1: { foo: "A", bar: "B" },
        },
    };

    /** @type {SampleHierarchyStub} */
    const sampleHierarchy = {
        sampleMetadata,
        sampleData: {
            entities: options.sampleDataEntities ?? {
                s1: { indexNumber: 0 },
            },
        },
    };

    const sampleView = createSampleViewStub({
        context,
        store,
        sampleHierarchy,
    });
    /** @type {any} */ (sampleView.spec).metadata = options.metadataDef ?? {};
    sampleView.findSampleForMouseEvent = () => undefined;

    const metadataView = new MetadataView(
        /** @type {any} */ (sampleView),
        /** @type {any} */ (sampleView)
    );

    sampleView.sampleHierarchy.sampleMetadata = sampleMetadata;
    await store.setState({
        provenance: {
            present: {
                sampleView: {
                    sampleMetadata,
                },
            },
        },
    });

    await waitForCondition(() =>
        sampleMetadata.attributeNames.every((attribute) =>
            metadataView
                .getDescendants()
                .some((view) => view.name === `attribute-${attribute}`)
        )
    );

    const attributeViews = Object.fromEntries(
        ["foo", "bar"].map((attribute) => [
            attribute,
            metadataView
                .getDescendants()
                .find((view) => view.name === `attribute-${attribute}`),
        ])
    );

    return {
        context,
        sampleView,
        metadataView,
        requestRender,
        transition,
        attributeViews,
    };
}

/**
 * @param {import("./metadataView.js").MetadataView} metadataView
 * @param {string} attribute
 */
function getAttributeLayerSpec(metadataView, attribute) {
    const view = metadataView
        .getDescendants()
        .find((view) => view.name === `attribute-${attribute}`);
    expect(view).toBeDefined();
    return /** @type {{ layer: any[] }} */ (view.spec);
}

/**
 * @param {import("./metadataView.js").MetadataView} metadataView
 * @param {string} attribute
 */
function getBackgroundLayerSpec(metadataView, attribute) {
    return getAttributeLayerSpec(metadataView, attribute).layer.find((layer) =>
        layer.name.endsWith("-missing-background")
    );
}

/**
 * @param {import("./metadataView.js").MetadataView} metadataView
 * @param {string} attribute
 */
function getBackgroundUnitView(metadataView, attribute) {
    return metadataView
        .getDescendants()
        .find(
            (view) =>
                view instanceof UnitView &&
                view.name === `attribute-${attribute}-missing-background`
        );
}

/**
 * @param {{
 *   metadataDef?: Record<string, any>,
 *   attributeDefs: Record<string, any>,
 * }} options
 */
function createMissingColorTestHarness(options) {
    const attributeNames = Object.keys(options.attributeDefs);
    return createMetadataViewTestHarness({
        metadataDef: options.metadataDef,
        sampleMetadata: {
            attributeNames,
            attributeDefs: options.attributeDefs,
            entities: {
                s1: Object.fromEntries(
                    attributeNames.map((attribute) => [attribute, "A"])
                ),
            },
        },
    });
}

describe("MetadataView", () => {
    beforeEach(() => {
        contextMenuMocks.contextMenu.mockReset();
    });

    it("provides short attribute titles from metadata leaf labels", async () => {
        const { metadataView } = await createMetadataViewTestHarness({
            sampleMetadata: {
                attributeNames: [
                    "Annotations/MouseID",
                    "Annotations/CustomTitle",
                ],
                attributeDefs: {
                    "Annotations/MouseID": { type: "nominal" },
                    "Annotations/CustomTitle": {
                        type: "nominal",
                        title: "Custom",
                    },
                },
                entities: {
                    s1: {
                        "Annotations/MouseID": "M1",
                        "Annotations/CustomTitle": "C1",
                    },
                },
            },
        });

        expect(
            metadataView.getAttributeInfo("Annotations/MouseID").shortTitle
        ).toBe("MouseID");
        expect(
            metadataView.getAttributeInfo("Annotations/CustomTitle").shortTitle
        ).toBe("Custom");
    });

    it("does not reserve space for metadata attribute titles by default", async () => {
        const { attributeViews } = await createMetadataViewTestHarness();

        expect(attributeViews.foo.spec.title).toMatchObject({
            text: "foo",
            reserve: false,
        });
    });

    it("can reserve space for metadata attribute titles", async () => {
        const { attributeViews } = await createMetadataViewTestHarness({
            metadataDef: { titleReserve: true },
        });

        expect(attributeViews.foo.spec.title).toMatchObject({
            text: "foo",
            reserve: true,
        });
    });

    it("removes dataflow hosts when metadata is rebuilt", async () => {
        const { MetadataView } = await import("./metadataView.js");
        const context = createTestViewContext();
        context.animator =
            /** @type {import("@genome-spy/core/utils/animator.js").default} */ (
                /** @type {any} */ ({
                    transition: () => Promise.resolve(),
                    requestRender: () => undefined,
                })
            );
        context.requestLayoutReflow = () => undefined;
        context.updateTooltip = () => undefined;
        context.getCurrentHover = () => undefined;
        context.addKeyboardListener = () => undefined;
        context.getNamedDataFromProvider = () => [];

        const dataFlow = context.dataFlow;

        const store = createStoreStub({
            provenance: {
                present: {
                    sampleView: {
                        sampleMetadata: {
                            attributeNames: [],
                            attributeDefs: {},
                            entities: {},
                        },
                    },
                },
            },
        });

        /** @type {SampleHierarchyStub} */
        const sampleHierarchy = {
            sampleMetadata: {
                attributeNames: [],
                attributeDefs: {},
                entities: {},
            },
            sampleData: {
                entities: {
                    s1: { indexNumber: 0 },
                    s2: { indexNumber: 1 },
                },
            },
        };

        const sampleView = createSampleViewStub({
            context,
            store,
            sampleHierarchy,
        });
        const metadataView = new MetadataView(
            /** @type {any} */ (sampleView),
            /** @type {any} */ (sampleView)
        );
        expect(store.getListenerCount()).toBe(1);
        expect(
            sampleView.compositeAttributeInfoSource.attributeInfoSourcesByType
                .SAMPLE_ATTRIBUTE
        ).toBeDefined();

        const getFlowSnapshot = () => {
            const unitViews = metadataView
                .getDescendants()
                .filter((view) => view instanceof UnitView);
            const firstUnitView = unitViews.find(isMetadataValueUnitView);

            const hasCollector =
                !!firstUnitView &&
                !!firstUnitView.flowHandle &&
                !!firstUnitView.flowHandle.collector;

            const hasDataSource =
                !!metadataView.flowHandle &&
                !!metadataView.flowHandle.dataSource;

            return {
                dataSources: dataFlow.dataSources.length,
                collectors: dataFlow.collectors.length,
                observers: unitViews.reduce(
                    (sum, view) =>
                        sum + (view.flowHandle?.collector?.observers.size ?? 0),
                    0
                ),
                unitViews: unitViews.filter(isMetadataValueUnitView).length,
                hasCollector,
                hasDataSource,
            };
        };

        /**
         * @param {string[]} attributeNames
         * @param {Record<string, any>} entities
         */
        const updateMetadata = async (attributeNames, entities) => {
            const attributeDefs = Object.fromEntries(
                attributeNames.map((name) => [name, { type: "nominal" }])
            );
            const sampleMetadata = {
                attributeNames,
                attributeDefs,
                entities,
            };

            sampleView.sampleHierarchy.sampleMetadata = sampleMetadata;
            await store.setState({
                provenance: {
                    present: {
                        sampleView: {
                            sampleMetadata,
                        },
                    },
                },
            });
            await metadataView.awaitMetadataReady();
            await waitForCondition(() => {
                const valueViews = metadataView
                    .getDescendants()
                    .filter(isMetadataValueUnitView);
                return (
                    valueViews.length > 0 &&
                    valueViews.every((view) => view.flowHandle?.collector)
                );
            });
        };

        await updateMetadata(["a", "b"], {
            s1: { a: "x", b: 1 },
            s2: { a: "y", b: 2 },
        });

        const initialSnapshot = getFlowSnapshot();
        assertFlowMatchesSubtree(metadataView, context.dataFlow);
        expect(initialSnapshot.hasCollector).toBe(true);
        expect(initialSnapshot.hasDataSource).toBe(true);

        await updateMetadata(["a"], {
            s1: { a: "x" },
            s2: { a: "y" },
        });

        const reducedSnapshot = getFlowSnapshot();
        assertFlowMatchesSubtree(metadataView, context.dataFlow);
        expect(reducedSnapshot.unitViews).toBeLessThan(
            initialSnapshot.unitViews
        );
        expect(reducedSnapshot.hasCollector).toBe(true);
        expect(reducedSnapshot.hasDataSource).toBe(true);

        await updateMetadata(["a"], {
            s1: { a: "z" },
            s2: { a: "w" },
        });

        const stableSnapshot = getFlowSnapshot();
        assertFlowMatchesSubtree(metadataView, context.dataFlow);
        expect(stableSnapshot).toEqual(reducedSnapshot);

        await updateMetadata(["a", "b"], {
            s1: { a: "x", b: 3 },
            s2: { a: "y", b: 4 },
        });

        const restoredSnapshot = getFlowSnapshot();
        assertFlowMatchesSubtree(metadataView, context.dataFlow);
        expect(restoredSnapshot).toEqual(initialSnapshot);

        metadataView.dispose();
        expect(store.getListenerCount()).toBe(0);
        expect(
            sampleView.compositeAttributeInfoSource.attributeInfoSourcesByType
                .SAMPLE_ATTRIBUTE
        ).toBeUndefined();
    });

    it("escapes dotted attribute names in encoding fields", async () => {
        const { MetadataView } = await import("./metadataView.js");
        const context = createTestViewContext();
        context.animator =
            /** @type {import("@genome-spy/core/utils/animator.js").default} */ (
                /** @type {any} */ ({
                    transition: () => Promise.resolve(),
                    requestRender: () => undefined,
                })
            );
        context.requestLayoutReflow = () => undefined;
        context.updateTooltip = () => undefined;
        context.getCurrentHover = () => undefined;
        context.addKeyboardListener = () => undefined;
        context.getNamedDataFromProvider = () => [];

        const store = createStoreStub({
            provenance: {
                present: {
                    sampleView: {
                        sampleMetadata: {
                            attributeNames: [],
                            attributeDefs: {},
                            entities: {},
                        },
                    },
                },
            },
        });

        /** @type {SampleHierarchyStub} */
        const sampleHierarchy = {
            sampleMetadata: {
                attributeNames: [],
                attributeDefs: {},
                entities: {},
            },
            sampleData: {
                entities: {
                    s1: { indexNumber: 0 },
                    s2: { indexNumber: 1 },
                },
            },
        };

        const sampleView = createSampleViewStub({
            context,
            store,
            sampleHierarchy,
        });
        const metadataView = new MetadataView(
            /** @type {any} */ (sampleView),
            /** @type {any} */ (sampleView)
        );

        const sampleMetadata = {
            attributeNames: ["group1.foo", "plain"],
            attributeDefs: {
                "group1.foo": { type: "nominal" },
                plain: { type: "nominal" },
            },
            entities: {
                s1: { "group1.foo": "A", plain: "X" },
                s2: { "group1.foo": "B", plain: "Y" },
            },
        };

        sampleView.sampleHierarchy.sampleMetadata = sampleMetadata;
        await store.setState({
            provenance: {
                present: {
                    sampleView: {
                        sampleMetadata,
                    },
                },
            },
        });
        await metadataView.awaitMetadataReady();

        await waitForCondition(() => {
            const valueViews = metadataView
                .getDescendants()
                .filter(isMetadataValueUnitView);
            return (
                valueViews.length > 0 &&
                valueViews.every((view) => view.flowHandle?.collector)
            );
        });

        const unitViews = metadataView
            .getDescendants()
            .filter(
                (view) => view instanceof UnitView && view.spec.encoding?.color
            );

        const dottedView = unitViews.find((view) => {
            const color = view.spec.encoding?.color;
            return color && /** @type {any} */ (color).field === "group1\\.foo";
        });
        expect(dottedView).toBeDefined();

        const plainView = unitViews.find((view) => {
            const color = view.spec.encoding?.color;
            return color && /** @type {any} */ (color).field === "plain";
        });
        expect(plainView).toBeDefined();

        metadataView.dispose();
    });

    it("uses the configured global metadata missing-value color", async () => {
        const { metadataView } = await createMissingColorTestHarness({
            metadataDef: {
                missingValueColor: "#dddddd",
            },
            attributeDefs: {
                status: { type: "nominal" },
            },
        });

        const backgroundLayer = getBackgroundLayerSpec(metadataView, "status");

        expect(backgroundLayer?.encoding.fill).toEqual({ value: "#dddddd" });
        expect(backgroundLayer?.encoding.fillOpacity).toEqual({ value: 1 });

        metadataView.dispose();
    });

    it("lets an attribute override the global missing-value color", async () => {
        const { metadataView } = await createMissingColorTestHarness({
            metadataDef: {
                missingValueColor: "#dddddd",
            },
            attributeDefs: {
                status: {
                    type: "nominal",
                    missingValueColor: "#cccccc",
                },
            },
        });

        const backgroundLayer = getBackgroundLayerSpec(metadataView, "status");

        expect(backgroundLayer?.encoding.fill).toEqual({ value: "#cccccc" });

        metadataView.dispose();
    });

    it("uses an opaque default missing-value color", async () => {
        const { metadataView } = await createMissingColorTestHarness({
            attributeDefs: {
                status: { type: "nominal" },
            },
        });

        const backgroundLayer = getBackgroundLayerSpec(metadataView, "status");

        expect(backgroundLayer?.encoding.fill).toEqual({ value: "#f0f0f0" });
        expect(backgroundLayer?.encoding.fillOpacity).toEqual({ value: 1 });

        metadataView.dispose();
    });

    it("omits the missing-value background layer when configured as null", async () => {
        const { metadataView } = await createMissingColorTestHarness({
            metadataDef: {
                missingValueColor: null,
            },
            attributeDefs: {
                status: { type: "nominal" },
            },
        });

        expect(getBackgroundLayerSpec(metadataView, "status")).toBeUndefined();
        expect(getBackgroundUnitView(metadataView, "status")).toBeUndefined();
        expect(
            getAttributeLayerSpec(metadataView, "status").layer
        ).toHaveLength(1);

        metadataView.dispose();
    });

    it("lets an attribute disable a configured global missing-value color", async () => {
        const { metadataView } = await createMissingColorTestHarness({
            metadataDef: {
                missingValueColor: "#dddddd",
            },
            attributeDefs: {
                status: {
                    type: "nominal",
                    missingValueColor: null,
                },
            },
        });

        expect(getBackgroundLayerSpec(metadataView, "status")).toBeUndefined();
        expect(getBackgroundUnitView(metadataView, "status")).toBeUndefined();
        expect(
            getAttributeLayerSpec(metadataView, "status").layer
        ).toHaveLength(1);

        metadataView.dispose();
    });

    it("omits the default missing-value background layer for bar-scale attributes", async () => {
        const { metadataView } = await createMissingColorTestHarness({
            attributeDefs: {
                score: {
                    type: "quantitative",
                    barScale: {},
                },
            },
        });

        expect(getBackgroundLayerSpec(metadataView, "score")).toBeUndefined();
        expect(getBackgroundUnitView(metadataView, "score")).toBeUndefined();
        expect(getAttributeLayerSpec(metadataView, "score").layer).toHaveLength(
            1
        );

        metadataView.dispose();
    });

    it("renders hierarchy for uploaded metadata converted with a separator", async () => {
        const { MetadataView } = await import("./metadataView.js");
        const context = createTestViewContext();
        context.animator =
            /** @type {import("@genome-spy/core/utils/animator.js").default} */ (
                /** @type {any} */ ({
                    transition: () => Promise.resolve(),
                    requestRender: () => undefined,
                })
            );
        context.requestLayoutReflow = () => undefined;
        context.updateTooltip = () => undefined;
        context.getCurrentHover = () => undefined;
        context.addKeyboardListener = () => undefined;
        context.getNamedDataFromProvider = () => [];

        const store = createStoreStub({
            provenance: {
                present: {
                    sampleView: {
                        sampleMetadata: {
                            attributeNames: [],
                            attributeDefs: {},
                            entities: {},
                        },
                    },
                },
            },
        });

        /** @type {SampleHierarchyStub} */
        const sampleHierarchy = {
            sampleMetadata: {
                attributeNames: [],
                attributeDefs: {},
                entities: {},
            },
            sampleData: {
                entities: {
                    s1: { indexNumber: 0 },
                    s2: { indexNumber: 1 },
                },
            },
        };

        const sampleView = createSampleViewStub({
            context,
            store,
            sampleHierarchy,
        });
        const metadataView = new MetadataView(
            /** @type {any} */ (sampleView),
            /** @type {any} */ (sampleView)
        );

        // Simulates uploaded metadata where delimiter "." was converted to "/".
        const sampleMetadata = {
            attributeNames: ["clinical/age", "clinical/status", "plain"],
            attributeDefs: {
                "clinical/age": { type: "quantitative" },
                "clinical/status": { type: "nominal" },
                plain: { type: "nominal" },
            },
            entities: {
                s1: { "clinical/age": 10, "clinical/status": "A", plain: "X" },
                s2: { "clinical/age": 20, "clinical/status": "B", plain: "Y" },
            },
        };

        sampleView.sampleHierarchy.sampleMetadata = sampleMetadata;
        await store.setState({
            provenance: {
                present: {
                    sampleView: {
                        sampleMetadata,
                    },
                },
            },
        });

        await waitForCondition(() =>
            metadataView
                .getDescendants()
                .some((view) => view.name === "attributeGroup-clinical")
        );

        const clinicalGroupView = metadataView
            .getDescendants()
            .find((view) => view.name === "attributeGroup-clinical");
        expect(clinicalGroupView).toBeDefined();
        expect(clinicalGroupView?.explicitName).toBe("attributeGroup-clinical");

        metadataView.dispose();
    });

    it("switches highlighted attributes without restarting the dimming transition", async () => {
        const { metadataView, requestRender, transition, attributeViews } =
            await createMetadataViewTestHarness();

        metadataView.handleInteraction(
            /** @type {any} */ ({
                type: "mousemove",
                target: attributeViews.foo,
            }),
            false
        );

        expect(metadataView._attributeHighlighState.currentAttribute).toBe(
            "foo"
        );
        expect(transition).toHaveBeenCalledTimes(1);
        const enterTransition = /** @type {any[][]} */ (
            transition.mock.calls
        )[0];
        expect(enterTransition).toBeDefined();
        expect(enterTransition[0]).toMatchObject({
            to: 0.1,
            duration: 1000,
            delay: 500,
        });
        expect(requestRender).toHaveBeenCalledTimes(1);

        metadataView.handleInteraction(
            /** @type {any} */ ({
                type: "mousemove",
                target: attributeViews.bar,
            }),
            false
        );

        expect(metadataView._attributeHighlighState.currentAttribute).toBe(
            "bar"
        );
        expect(transition).toHaveBeenCalledTimes(1);
        expect(requestRender).toHaveBeenCalledTimes(2);

        metadataView.dispose();
    });

    it("keeps the current highlight when the pointer moves over gaps between attributes", async () => {
        const { metadataView, requestRender, transition, attributeViews } =
            await createMetadataViewTestHarness();

        metadataView.handleInteraction(
            /** @type {any} */ ({
                type: "mousemove",
                target: attributeViews.foo,
            }),
            false
        );

        transition.mockClear();
        requestRender.mockClear();

        metadataView.handleInteraction(
            /** @type {any} */ ({
                type: "mousemove",
                target: metadataView,
            }),
            false
        );

        expect(metadataView._attributeHighlighState.currentAttribute).toBe(
            "foo"
        );
        expect(transition).not.toHaveBeenCalled();
        expect(requestRender).not.toHaveBeenCalled();

        metadataView.dispose();
    });

    it("does not update tooltip while a mouse button is pressed", async () => {
        const { context, sampleView, metadataView, attributeViews } =
            await createMetadataViewTestHarness();

        const updateTooltip = vi.fn();
        context.updateTooltip = updateTooltip;
        sampleView.findSampleForMouseEvent = () => ({ id: "s1" });

        metadataView.handleInteraction(
            /** @type {any} */ ({
                type: "mousemove",
                target: attributeViews.foo,
                mouseEvent: { buttons: 1 },
            }),
            false
        );

        expect(updateTooltip).not.toHaveBeenCalled();

        metadataView.dispose();
    });

    it("keeps the hovered metadata tooltip row visible", async () => {
        const { context, sampleView, metadataView, attributeViews } =
            await createMetadataViewTestHarness();

        const scrollIntoView = vi.fn();
        const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
        HTMLElement.prototype.scrollIntoView = scrollIntoView;

        try {
            /** @type {(id: string) => Promise<import("lit").TemplateResult>} */
            let tooltipConverter;
            context.updateTooltip = vi.fn((_id, converter) => {
                tooltipConverter = converter;
            });
            sampleView.findSampleForMouseEvent = () => ({ id: "s1" });
            const tooltipContainer = document.createElement("div");
            const tooltip = new Tooltip(tooltipContainer);
            tooltip.mouseCoords = [0, 0];

            metadataView.handleInteraction(
                /** @type {any} */ ({
                    type: "mousemove",
                    target: attributeViews.bar,
                    mouseEvent: { buttons: 0 },
                }),
                false
            );

            tooltip.setContent(
                await tooltipConverter(JSON.stringify(["s1", "bar"]))
            );

            const scroller = tooltipContainer.querySelector(
                ".autoscroll-container"
            );
            expect(scroller).not.toBeNull();
            expect(scroller?.querySelector("tr.hovered th")?.textContent).toBe(
                "bar"
            );
            await Promise.resolve();
            expect(scrollIntoView).toHaveBeenCalledWith({
                block: "nearest",
                inline: "nearest",
            });

            tooltip.setContent(
                await tooltipConverter(JSON.stringify(["s1", "foo"]))
            );

            const updatedScroller = tooltipContainer.querySelector(
                ".autoscroll-container"
            );
            expect(
                updatedScroller?.querySelector("tr.hovered th")?.textContent
            ).toBe("foo");
            await Promise.resolve();
            expect(scrollIntoView).toHaveBeenCalledTimes(2);
        } finally {
            HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
            metadataView.dispose();
        }
    });

    it("ignores synthesized mouseleave while the pointer is still inside the metadata view", async () => {
        const { metadataView, requestRender, transition, attributeViews } =
            await createMetadataViewTestHarness();

        Object.defineProperty(metadataView, "coords", {
            value: {
                containsPoint: () => true,
            },
        });

        metadataView.handleInteraction(
            /** @type {any} */ ({
                type: "mousemove",
                target: attributeViews.foo,
            }),
            false
        );

        transition.mockClear();
        requestRender.mockClear();

        metadataView.handleInteraction(
            /** @type {any} */ ({
                type: "mouseleave",
                point: { x: 1, y: 1 },
                uiEvent: { type: "mousemove" },
            }),
            false
        );

        expect(metadataView._attributeHighlighState.currentAttribute).toBe(
            "foo"
        );
        expect(transition).not.toHaveBeenCalled();
        expect(requestRender).not.toHaveBeenCalled();

        metadataView.dispose();
    });

    it("clears attribute highlight on mouseleave without an exit delay", async () => {
        const { metadataView, requestRender, transition, attributeViews } =
            await createMetadataViewTestHarness();

        metadataView.handleInteraction(
            /** @type {any} */ ({
                type: "mousemove",
                target: attributeViews.foo,
            }),
            false
        );

        transition.mockClear();
        requestRender.mockClear();
        metadataView._attributeHighlighState.backgroundOpacity = 0.1;

        metadataView.handleInteraction(
            /** @type {any} */ ({
                type: "mouseleave",
                uiEvent: { type: "mouseout" },
            }),
            false
        );

        expect(metadataView._attributeHighlighState.currentAttribute).toBe(
            undefined
        );
        expect(transition).toHaveBeenCalledTimes(1);
        const leaveTransition = /** @type {any[][]} */ (
            transition.mock.calls
        )[0];
        expect(leaveTransition).toBeDefined();
        expect(leaveTransition[0]).toMatchObject({
            to: 1.0,
            duration: 200,
            delay: 0,
        });
        expect(requestRender).toHaveBeenCalledTimes(1);

        metadataView.dispose();
    });
});
