import { describe, expect, test, vi } from "vitest";

import { createTestViewContext } from "../view/testUtils.js";
import { buildDataFlow } from "../view/flowBuilder.js";
import { optimizeDataFlow } from "./flowOptimizer.js";
import {
    collectNearestViewSubtreeDataSources,
    collectViewSubtreeDataSources,
    initializeViewSubtree,
    loadViewSubtreeData,
    syncFlowHandles,
} from "./flowInit.js";

describe("flowInit", () => {
    test("syncs handles to canonical data sources after merge", async () => {
        const context = createTestViewContext();
        context.getNamedDataFromProvider = () => [];
        context.addBroadcastListener = () => undefined;
        context.removeBroadcastListener = () => undefined;

        /** @type {import("../spec/view.js").HConcatSpec} */
        const spec = {
            hconcat: [
                {
                    data: { name: "shared" },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
                {
                    data: { name: "shared" },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
            ],
        };

        const root = await context.createOrImportView(spec, null, null, "root");

        const flow = buildDataFlow(root, context.dataFlow);
        const canonicalBySource = optimizeDataFlow(flow);
        syncFlowHandles(root, canonicalBySource);

        const concatRoot =
            /** @type {import("../view/concatView.js").default} */ (root);
        const left = concatRoot.children[0];
        const right = concatRoot.children[1];

        expect(left.flowHandle.dataSource).toBeDefined();
        expect(right.flowHandle.dataSource).toBeDefined();
        expect(left.flowHandle.dataSource).toBe(right.flowHandle.dataSource);

        const sharedSources = flow.dataSources.filter(
            (/** @type {import("./sources/dataSource.js").default} */ source) =>
                source.identifier === "shared"
        );
        expect(sharedSources).toEqual([left.flowHandle.dataSource]);
    });

    test("initializeViewSubtree wires collector updates for subtree loads", async () => {
        const context = createTestViewContext();
        context.getNamedDataFromProvider = () => [];
        context.addBroadcastListener = () => undefined;
        context.removeBroadcastListener = () => undefined;

        /** @type {import("../spec/view.js").UnitSpec} */
        const spec = {
            data: { values: [{ x: 1 }, { x: 2 }] },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
            },
        };

        const root = await context.createOrImportView(spec, null, null, "root");
        const { dataSources } = initializeViewSubtree(root, context.dataFlow);

        // This guards subtree-only initialization: dynamic view rebuilds should still
        // trigger mark updates when their local collectors complete.
        const unitView = /** @type {import("../view/unitView.js").default} */ (
            root
        );
        const initializeSpy = vi.spyOn(unitView.mark, "initializeData");

        await Promise.all(
            Array.from(dataSources).map((dataSource) => dataSource.load())
        );

        expect(initializeSpy).toHaveBeenCalledTimes(1);
        initializeSpy.mockRestore();
    });

    test("disposeSubtree removes observers before rebuilding subtree", async () => {
        const context = createTestViewContext();
        context.getNamedDataFromProvider = () => [{ x: 1 }];
        context.addBroadcastListener = () => undefined;
        context.removeBroadcastListener = () => undefined;

        /** @type {import("../spec/view.js").UnitSpec} */
        const spec = {
            data: { name: "shared" },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
            },
        };

        const firstRoot = await context.createOrImportView(
            spec,
            null,
            null,
            "first"
        );
        const { dataSources: firstSources } = initializeViewSubtree(
            firstRoot,
            context.dataFlow
        );

        const firstUnit = /** @type {import("../view/unitView.js").default} */ (
            firstRoot
        );
        const firstCollector = firstUnit.flowHandle.collector;
        const firstInitializeSpy = vi.spyOn(firstUnit.mark, "initializeData");

        await Promise.all(
            Array.from(firstSources).map((dataSource) => dataSource.load())
        );

        expect(firstInitializeSpy).toHaveBeenCalledTimes(1);
        firstInitializeSpy.mockRestore();

        firstRoot.disposeSubtree();

        // This prevents stale observers from firing after a subtree is rebuilt.
        expect(firstCollector.observers.size).toBe(0);

        const secondRoot = await context.createOrImportView(
            spec,
            null,
            null,
            "second"
        );
        const { dataSources: secondSources } = initializeViewSubtree(
            secondRoot,
            context.dataFlow
        );

        const secondUnit =
            /** @type {import("../view/unitView.js").default} */ (secondRoot);
        const secondInitializeSpy = vi.spyOn(secondUnit.mark, "initializeData");

        await Promise.all(
            Array.from(secondSources).map((dataSource) => dataSource.load())
        );

        expect(secondInitializeSpy).toHaveBeenCalledTimes(1);
        secondInitializeSpy.mockRestore();
    });

    test("collectNearestViewSubtreeDataSources stops at nested sources", async () => {
        const context = createTestViewContext();
        context.addBroadcastListener = () => undefined;
        context.removeBroadcastListener = () => undefined;

        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            data: { values: [{ x: 0 }] },
            layer: [
                {
                    data: { values: [{ x: 1 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
                {
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
            ],
        };

        const root = await context.createOrImportView(spec, null, null, "root");
        initializeViewSubtree(root, context.dataFlow);

        // Nearest-source semantics: a top-level source hides deeper sources.
        const sources = collectNearestViewSubtreeDataSources(root);
        expect(sources.size).toBe(1);

        const [rootSource] = Array.from(sources);
        const layerRoot =
            /** @type {import("../view/layerView.js").default} */ (root);
        const childWithSource = layerRoot.children[0];

        expect(rootSource).toBe(layerRoot.flowHandle.dataSource);
        expect(childWithSource.flowHandle.dataSource).not.toBe(rootSource);
    });

    test("loadViewSubtreeData only loads nearest sources", async () => {
        const context = createTestViewContext();
        context.addBroadcastListener = () => undefined;
        context.removeBroadcastListener = () => undefined;

        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            data: { values: [{ x: 0 }] },
            layer: [
                {
                    data: { values: [{ x: 1 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
            ],
        };

        const root = await context.createOrImportView(spec, null, null, "root");
        initializeViewSubtree(root, context.dataFlow);

        const layerRoot =
            /** @type {import("../view/layerView.js").default} */ (root);
        const rootSource = layerRoot.flowHandle.dataSource;
        const childSource = layerRoot.children[0].flowHandle.dataSource;

        const rootLoadSpy = vi.spyOn(rootSource, "load");
        const childLoadSpy = vi.spyOn(childSource, "load");

        // Data-ready should ignore nested sources.
        await loadViewSubtreeData(root);

        expect(rootLoadSpy).toHaveBeenCalledTimes(1);
        expect(childLoadSpy).toHaveBeenCalledTimes(0);

        rootLoadSpy.mockRestore();
        childLoadSpy.mockRestore();
    });

    test("collectViewSubtreeDataSources includes nested sources", async () => {
        const context = createTestViewContext();
        context.addBroadcastListener = () => undefined;
        context.removeBroadcastListener = () => undefined;

        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            data: { values: [{ x: 0 }] },
            layer: [
                {
                    data: { values: [{ x: 1 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
            ],
        };

        const root = await context.createOrImportView(spec, null, null, "root");
        initializeViewSubtree(root, context.dataFlow);

        // Initialization needs the full set of sources, including nested ones.
        const sources = collectViewSubtreeDataSources(root);
        expect(sources.size).toBe(2);
    });

    test("collectNearestViewSubtreeDataSources returns child sources when root has none", async () => {
        const context = createTestViewContext();
        context.addBroadcastListener = () => undefined;
        context.removeBroadcastListener = () => undefined;

        /** @type {import("../spec/view.js").HConcatSpec} */
        const spec = {
            hconcat: [
                {
                    data: { values: [{ x: 1 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
                {
                    data: { values: [{ x: 2 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
            ],
        };

        const root = await context.createOrImportView(spec, null, null, "root");
        initializeViewSubtree(root, context.dataFlow);

        // Without a root source, the nearest sources include the child sources.
        // Layout decorations may add additional sources.
        const sources = collectNearestViewSubtreeDataSources(root);
        const concatRoot =
            /** @type {import("../view/concatView.js").default} */ (root);
        expect(sources.has(concatRoot.children[0].flowHandle.dataSource)).toBe(
            true
        );
        expect(sources.has(concatRoot.children[1].flowHandle.dataSource)).toBe(
            true
        );
    });

    test("loadViewSubtreeData emits subtree data ready broadcast", async () => {
        const context = createTestViewContext();
        context.addBroadcastListener = () => undefined;
        context.removeBroadcastListener = () => undefined;

        /** @type {import("../spec/view.js").UnitSpec} */
        const spec = {
            data: { values: [{ x: 1 }] },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
            },
        };

        const root = await context.createOrImportView(spec, null, null, "root");
        initializeViewSubtree(root, context.dataFlow);

        let calls = 0;
        root._addBroadcastHandler("subtreeDataReady", (message) => {
            calls += 1;
            expect(message.payload.subtreeRoot).toBe(root);
        });

        await loadViewSubtreeData(root);

        expect(calls).toBe(1);
    });
});
