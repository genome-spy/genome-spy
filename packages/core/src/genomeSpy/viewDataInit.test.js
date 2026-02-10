import { describe, expect, test, vi } from "vitest";

import UnitView from "../view/unitView.js";
import ConcatView from "../view/concatView.js";
import NamedSource from "../data/sources/namedSource.js";

import { createTestViewContext } from "../view/testUtils.js";
import {
    initializeViewData,
    initializeVisibleViewData,
} from "./viewDataInit.js";
import { transforms } from "../data/transforms/transformFactory.js";
import Transform from "../data/transforms/transform.js";

describe("viewDataInit", () => {
    test("skips hidden subtrees during initial data initialization", async () => {
        const context = createTestViewContext();
        context.isViewConfiguredVisible = (view) => view.spec.visible ?? true;
        context.addBroadcastListener = () => undefined;
        context.removeBroadcastListener = () => undefined;

        /** @type {import("../spec/view.js").VConcatSpec} */
        const spec = {
            vconcat: [
                {
                    name: "visible",
                    data: { values: [{ x: 1 }, { x: 2 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
                {
                    name: "hidden",
                    visible: false,
                    data: { values: [{ x: 3 }, { x: 4 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
            ],
        };

        const root = await context.createOrImportView(spec, null, null, "root");

        await initializeViewData(
            root,
            context.dataFlow,
            context.fontManager,
            () => undefined
        );

        const visibleView = root
            .getDescendants()
            .find((view) => view.name === "visible");
        const hiddenView = root
            .getDescendants()
            .find((view) => view.name === "hidden");

        expect(visibleView?.flowHandle?.collector).toBeDefined();
        expect(visibleView?.getDataInitializationState()).toBe("ready");

        // Hidden views should not allocate collectors or mark initialization.
        expect(hiddenView?.flowHandle).toBeUndefined();
        expect(hiddenView?.getDataInitializationState()).toBe("none");
    });

    test("initializes newly visible views without rebuilding existing collectors", async () => {
        const context = createTestViewContext();
        context.isViewConfiguredVisible = (view) => view.spec.visible ?? true;
        context.addBroadcastListener = () => undefined;
        context.removeBroadcastListener = () => undefined;

        /** @type {import("../spec/view.js").VConcatSpec} */
        const spec = {
            vconcat: [
                {
                    name: "visible",
                    data: { values: [{ x: 1 }, { x: 2 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
                {
                    name: "hidden",
                    visible: false,
                    data: { values: [{ x: 3 }, { x: 4 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
            ],
        };

        const root = await context.createOrImportView(spec, null, null, "root");
        if (!(root instanceof ConcatView)) {
            throw new Error("Expected a concat view for root.");
        }
        /** @type {ConcatView} */
        const rootView = root;

        await initializeViewData(
            rootView,
            context.dataFlow,
            context.fontManager,
            () => undefined
        );

        const visibleView = root
            .getDescendants()
            .find((view) => view.name === "visible");
        const hiddenView = root
            .getDescendants()
            .find((view) => view.name === "hidden");
        const visibleCollector = visibleView?.flowHandle?.collector;

        // Toggle visibility predicate to include the previously hidden view.
        context.isViewConfiguredVisible = () => true;

        await initializeVisibleViewData(
            root,
            context.dataFlow,
            context.fontManager
        );

        expect(hiddenView?.flowHandle?.collector).toBeDefined();
        expect(hiddenView?.getDataInitializationState()).toBe("ready");
        expect(visibleView?.flowHandle?.collector).toBe(visibleCollector);
    });

    test("shared sources do not add duplicate observers for existing views", async () => {
        const context = createTestViewContext();
        context.getNamedDataFromProvider = () => [{ x: 1 }, { x: 2 }];
        context.isViewConfiguredVisible = (view) => view.spec.visible ?? true;
        context.addBroadcastListener = () => undefined;
        context.removeBroadcastListener = () => undefined;

        /** @type {import("../spec/view.js").HConcatSpec} */
        const spec = {
            hconcat: [
                {
                    name: "visible",
                    data: { name: "shared" },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
                {
                    name: "hidden",
                    visible: false,
                    data: { name: "shared" },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
            ],
        };

        const root = await context.createOrImportView(spec, null, null, "root");
        await initializeViewData(
            root,
            context.dataFlow,
            context.fontManager,
            () => undefined
        );

        const visibleView = root
            .getDescendants()
            .find((view) => view.name === "visible");
        if (!(visibleView instanceof UnitView)) {
            throw new Error("Expected a unit view for visible branch.");
        }
        const mark = visibleView.mark;

        // Visibility toggle should not wire the same collector twice.
        const initializeSpy = vi.spyOn(mark, "initializeData");

        context.isViewConfiguredVisible = () => true;
        await initializeVisibleViewData(
            root,
            context.dataFlow,
            context.fontManager
        );

        expect(initializeSpy).toHaveBeenCalledTimes(1);
        initializeSpy.mockRestore();
    });

    test("completed collectors repropagate to newly attached views", async () => {
        const context = createTestViewContext();
        context.isViewConfiguredVisible = (view) => view.spec.visible ?? true;
        context.addBroadcastListener = () => undefined;
        context.removeBroadcastListener = () => undefined;

        // Build a minimal concat tree so we can dynamically append a view.
        /** @type {import("../spec/view.js").VConcatSpec} */
        const spec = {
            vconcat: [
                {
                    name: "base",
                    data: { values: [{ x: 1 }, { x: 2 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
            ],
        };

        const root = await context.createOrImportView(spec, null, null, "root");
        if (!(root instanceof ConcatView)) {
            throw new Error("Expected a concat view for root.");
        }
        /** @type {ConcatView} */
        const rootView = root;

        await initializeViewData(
            rootView,
            context.dataFlow,
            context.fontManager,
            () => undefined
        );

        // Base view owns the data source + collector; it is already complete.
        const baseView = rootView
            .getDescendants()
            .find(
                /** @param {import("../view/view.js").default} view */ (view) =>
                    view.name === "base"
            );
        if (!(baseView instanceof UnitView)) {
            throw new Error("Expected a unit view for base branch.");
        }

        const dataSource = baseView.flowHandle?.dataSource;
        if (!dataSource) {
            throw new Error("Expected base view to have a data source.");
        }

        // If we attach a new view below the completed collector, we should
        // repropagate instead of triggering another source load.
        const loadSpy = vi.spyOn(dataSource, "load");
        loadSpy.mockClear();

        // Attach a new UnitView that inherits data from baseView's collector.
        /** @type {import("../spec/view.js").UnitSpec} */
        const summarySpec = {
            name: "summary",
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "x", type: "quantitative" },
            },
        };

        const summaryView = await context.createOrImportView(
            summarySpec,
            rootView,
            baseView,
            "summary"
        );

        rootView.appendChildView(summaryView);

        await initializeVisibleViewData(
            rootView,
            context.dataFlow,
            context.fontManager
        );

        // The new collector should have data even though the data source
        // was not reloaded.
        const summaryCollector = summaryView.flowHandle?.collector;
        expect(summaryCollector).toBeDefined();
        expect(summaryCollector?.completed).toBe(true);
        let datumCount = 0;
        for (const _ of summaryCollector?.getData() ?? []) {
            datumCount++;
        }
        expect(datumCount).toBeGreaterThan(0);
        expect(loadSpy).not.toHaveBeenCalled();

        loadSpy.mockRestore();
    });

    test("lazy init does not reinitialize existing flow nodes", async () => {
        const context = createTestViewContext();
        context.getNamedDataFromProvider = () => [{ x: 1 }, { x: 2 }];
        context.isViewConfiguredVisible = (view) => view.spec.visible ?? true;
        context.addBroadcastListener = () => undefined;
        context.removeBroadcastListener = () => undefined;

        let initCalls = 0;

        class InitOnceTransform extends Transform {
            initialize() {
                initCalls += 1;
                this.paramRuntimeProvider.paramRuntime.allocateSetter(
                    "initOnceParam",
                    0,
                    true
                );
            }

            /**
             * @param {import("../data/flowNode.js").Datum} datum
             */
            handle(datum) {
                this._propagate(datum);
            }
        }

        const previousTransform = transforms.initOnceTest;
        transforms.initOnceTest = InitOnceTransform;

        try {
            /** @type {import("../spec/view.js").HConcatSpec} */
            const spec = {
                hconcat: [
                    {
                        name: "visible",
                        data: { name: "shared" },
                        mark: "point",
                        transform: /** @type {any} */ ([
                            { type: "initOnceTest" },
                        ]),
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                        },
                    },
                    {
                        name: "hidden",
                        visible: false,
                        data: { name: "shared" },
                        mark: "point",
                        transform: /** @type {any} */ ([
                            { type: "initOnceTest" },
                        ]),
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                        },
                    },
                ],
            };

            const root = await context.createOrImportView(
                spec,
                null,
                null,
                "root"
            );

            await initializeViewData(
                root,
                context.dataFlow,
                context.fontManager,
                () => undefined
            );

            // Only the visible branch should initialize at first.
            expect(initCalls).toBe(1);

            context.isViewConfiguredVisible = () => true;

            await initializeVisibleViewData(
                root,
                context.dataFlow,
                context.fontManager
            );

            // Hidden branch initializes once; visible branch is not reinitialized.
            expect(initCalls).toBe(2);
        } finally {
            if (previousTransform) {
                transforms.initOnceTest = previousTransform;
            } else {
                delete transforms.initOnceTest;
            }
        }
    });

    test("stacked data updates named domains after dynamic data injection", async () => {
        const context = createTestViewContext();
        context.getNamedDataFromProvider = () => [];
        context.isViewConfiguredVisible = () => true;
        context.addBroadcastListener = () => undefined;
        context.removeBroadcastListener = () => undefined;

        /** @type {import("../spec/view.js").UnitSpec} */
        const spec = {
            data: { name: "data" },
            transform: [
                {
                    type: "stack",
                    field: "z",
                    groupby: ["x"],
                    as: ["y0", "y1"],
                },
            ],
            mark: "rect",
            encoding: {
                x: { field: "x", type: "nominal", band: 0.8 },
                y: { field: "y0", type: "quantitative" },
                y2: { field: "y1" },
                color: { field: "q", type: "nominal" },
            },
        };

        const root = await context.createOrImportView(spec, null, null, "root");
        if (!(root instanceof UnitView)) {
            throw new Error("Expected a unit view for stacked test.");
        }

        await initializeViewData(
            root,
            context.dataFlow,
            context.fontManager,
            () => undefined
        );

        const dataSource = root.flowHandle?.dataSource;
        if (!(dataSource instanceof NamedSource)) {
            throw new Error(
                "Expected a named data source with updateDynamicData"
            );
        }

        // Simulate a late-arriving named dataset update.
        const data = [
            { x: 1, q: "A", z: 7 },
            { x: 1, q: "B", z: 3 },
            { x: 1, q: "C", z: 10 },
            { x: 2, q: "A", z: 8 },
            { x: 2, q: "B", z: 5 },
            { x: 3, q: "B", z: 10 },
        ];

        dataSource.updateDynamicData(data);

        const collector = root.flowHandle?.collector;
        if (!collector) {
            throw new Error("Expected a collector after initialization.");
        }

        // Stacked output should be materialized in the collector.
        const stacked = Array.from(collector.getData());
        expect(stacked.length).toBe(data.length);
        expect(
            stacked.every(
                (datum) =>
                    typeof datum.y0 === "number" && typeof datum.y1 === "number"
            )
        ).toBe(true);

        // Domains should reflect the dynamic data update.
        expect(root.getScaleResolution("x")?.getDomain()).toEqual([1, 2, 3]);
        expect(root.getScaleResolution("color")?.getDomain()).toEqual([
            "A",
            "B",
            "C",
        ]);

        // Sanity check: max stack height per x equals group sum.
        const maxByX = new Map();
        for (const datum of stacked) {
            const previous = maxByX.get(datum.x) ?? -Infinity;
            maxByX.set(datum.x, Math.max(previous, datum.y1));
        }
        expect(maxByX.get(1)).toBe(20);
        expect(maxByX.get(2)).toBe(13);
        expect(maxByX.get(3)).toBe(10);
    });
});
