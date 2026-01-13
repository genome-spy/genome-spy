import { describe, expect, it, vi } from "vitest";

import ConcatView from "@genome-spy/core/view/concatView.js";
import UnitView from "@genome-spy/core/view/unitView.js";
import { createTestViewContext } from "@genome-spy/core/view/testUtils.js";
import CompositeAttributeInfoSource from "../compositeAttributeInfoSource.js";

vi.mock("../attributeContextMenu.js", () => ({ default: () => [] }));

/**
 * @typedef {object} StoreStub
 * @prop {() => any} getState
 * @prop {(listener: () => void) => () => void} subscribe
 * @prop {() => number} getListenerCount
 * @prop {(nextState: any) => void} setState
 */

/**
 * @typedef {object} SampleHierarchyStub
 * @prop {{ attributeNames: string[], attributeDefs: Record<string, any>, entities: Record<string, any> }} sampleMetadata
 * @prop {{ entities: Record<string, { indexNumber: number }> }} sampleData
 */

/**
 * @typedef {import("@genome-spy/core/view/concatView.js").default & {
 *   spec: { samples: import("@genome-spy/core/spec/sampleView.js").SampleDef },
 *   sampleHierarchy: SampleHierarchyStub,
 *   compositeAttributeInfoSource: { addAttributeInfoSource: (name: string, resolver: (attribute: any) => any) => void, removeAttributeInfoSource: (name: string, resolver?: (attribute: any) => any) => void, attributeInfoSourcesByType: Record<string, any> },
 *   provenance: { store: StoreStub, getPresentState: () => any },
 *   locationManager: { clipBySummary: (coords: import("@genome-spy/core/view/layout/rectangle.js").default) => import("@genome-spy/core/view/layout/rectangle.js").default },
 *   findSampleForMouseEvent: (coords: import("@genome-spy/core/view/layout/rectangle.js").default, event: any) => any,
 *   makePeekMenuItem: () => any,
 *   actions: { filterByNominal: any },
 *   dispatchAttributeAction: (action: any) => void,
 * }} SampleViewStub
 */

/**
 * @param {any} initialState
 * @returns {StoreStub}
 */
function createStore(initialState) {
    let state = initialState;
    /** @type {Set<() => void>} */
    const listeners = new Set();

    return {
        getState: () => state,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        getListenerCount: () => listeners.size,
        setState: (nextState) => {
            state = nextState;
            for (const listener of Array.from(listeners)) {
                listener();
            }
        },
    };
}

/**
 * @param {import("@genome-spy/core/types/viewContext.js").default} context
 * @param {StoreStub} store
 * @param {SampleHierarchyStub} sampleHierarchy
 * @returns {SampleViewStub}
 */
function createSampleView(context, store, sampleHierarchy) {
    const view = new ConcatView({ hconcat: [] }, context, null, null, "sample");

    view.spec = { samples: {} };
    view.sampleHierarchy = sampleHierarchy;
    view.compositeAttributeInfoSource = new CompositeAttributeInfoSource();
    view.provenance = {
        store,
        getPresentState: () => ({}),
    };
    view.locationManager = {
        clipBySummary: (coords) => coords,
    };
    view.findSampleForMouseEvent = () => undefined;
    view.makePeekMenuItem = () => ({});
    view.actions = { filterByNominal: () => ({}) };
    view.dispatchAttributeAction = () => undefined;

    return /** @type {SampleViewStub} */ (view);
}

/**
 * @param {import("./metadataView.js").MetadataView} metadataView
 * @param {import("@genome-spy/core/data/dataFlow.js").default} dataFlow
 */
function assertFlowMatchesSubtree(metadataView, dataFlow) {
    const descendants = metadataView.getDescendants();
    const unitViews = descendants.filter((view) => view instanceof UnitView);
    const dataSources = dataFlow.getDataSourcesForHosts(descendants);

    expect(dataFlow.getDataSourceHostCount()).toBe(dataSources.length);
    expect(dataFlow.getCollectorHostCount()).toBe(unitViews.length);
    expect(dataFlow._observers.size).toBe(unitViews.length);
}

describe("MetadataView", () => {
    it("removes dataflow hosts when metadata is rebuilt", async () => {
        const { MetadataView } = await import("./metadataView.js");
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
        context.getNamedDataFromProvider = () => [];

        const dataFlow = context.dataFlow;
        const addObserver = dataFlow.addObserver.bind(dataFlow);
        dataFlow.addObserver = (callback, key) => {
            addObserver(() => undefined, key);
        };

        const store = createStore({
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

        const sampleView = createSampleView(context, store, sampleHierarchy);
        const metadataView = new MetadataView(sampleView, sampleView);
        expect(store.getListenerCount()).toBe(1);
        expect(
            sampleView.compositeAttributeInfoSource.attributeInfoSourcesByType
                .SAMPLE_ATTRIBUTE
        ).toBeDefined();

        const getFlowSnapshot = () => {
            const unitViews = metadataView
                .getDescendants()
                .filter((view) => view instanceof UnitView);
            const firstUnitView = unitViews[0];

            const hasCollector =
                !!firstUnitView &&
                !!firstUnitView.flowHandle &&
                !!firstUnitView.flowHandle.collector;

            const hasDataSource =
                !!metadataView.flowHandle &&
                !!metadataView.flowHandle.dataSource;

            return {
                dataSources: dataFlow.getDataSourceHostCount(),
                collectors: dataFlow.getCollectorHostCount(),
                observers: dataFlow._observers.size,
                unitViews: unitViews.length,
                hasCollector,
                hasDataSource,
            };
        };

        /**
         * @param {string[]} attributeNames
         * @param {Record<string, any>} entities
         */
        const updateMetadata = (attributeNames, entities) => {
            const attributeDefs = Object.fromEntries(
                attributeNames.map((name) => [name, { type: "nominal" }])
            );
            const sampleMetadata = {
                attributeNames,
                attributeDefs,
                entities,
            };

            sampleView.sampleHierarchy.sampleMetadata = sampleMetadata;
            store.setState({
                provenance: {
                    present: {
                        sampleView: {
                            sampleMetadata,
                        },
                    },
                },
            });
        };

        updateMetadata(["a", "b"], {
            s1: { a: "x", b: 1 },
            s2: { a: "y", b: 2 },
        });

        const initialSnapshot = getFlowSnapshot();
        assertFlowMatchesSubtree(metadataView, context.dataFlow);
        expect(initialSnapshot.hasCollector).toBe(true);
        expect(initialSnapshot.hasDataSource).toBe(true);

        updateMetadata(["a"], {
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

        updateMetadata(["a"], {
            s1: { a: "z" },
            s2: { a: "w" },
        });

        const stableSnapshot = getFlowSnapshot();
        assertFlowMatchesSubtree(metadataView, context.dataFlow);
        expect(stableSnapshot).toEqual(reducedSnapshot);

        updateMetadata(["a", "b"], {
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
});
