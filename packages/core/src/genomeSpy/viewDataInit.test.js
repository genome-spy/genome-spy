import { describe, expect, onTestFinished, test, vi } from "vitest";

import UnitView from "../view/unitView.js";
import ConcatView from "../view/concatView.js";
import NamedSource from "../data/sources/namedSource.js";
import { registerLazyDataSource } from "../data/sources/dataSourceFactory.js";
import MockLazySource from "../data/sources/lazy/mockLazySource.js";

import {
    createHeadlessEngine,
    createTestViewContext,
    renderToLayout,
} from "../view/testUtils.js";
import {
    initializeViewData,
    initializeVisibleViewData,
} from "./viewDataInit.js";
import { transforms } from "../data/transforms/transformFactory.js";
import Transform from "../data/transforms/transform.js";
import { loadViewSubtreeData } from "../data/flowInit.js";

describe("viewDataInit", () => {
    test.each([
        "datum == null",
        "threshold > 0",
        "smoothed > 0",
        "fromScale > 0",
        "span(range('x')) > 0",
        "42",
    ])("rejects unsupported view visibility: %s", async (expr) => {
        await expect(
            createHeadlessEngine({
                params: [
                    { name: "threshold", expr: "width / 2", debounce: 1 },
                    {
                        name: "smoothed",
                        expr: "threshold",
                        transition: { type: "lerp" },
                    },
                    { name: "fromScale", expr: "domain('x')[0]" },
                ],
                visible: { expr },
                mark: "point",
                encoding: { x: { datum: 0, type: "quantitative" } },
            })
        ).rejects.toThrow(/visible\.expr/);
    });
    test("rejects visibility driven by data contributing to an ancestor scale", async () => {
        await expect(
            createHeadlessEngine({
                scales: { x: { type: "linear" } },
                vconcat: [
                    {
                        visible: { expr: "span(domain('x')) < 10000" },
                        mark: "point",
                        data: { values: [{ x: 10 }] },
                        encoding: { x: { field: "x", type: "quantitative" } },
                    },
                ],
            })
        ).rejects.toThrow(/visible.expr.*literal domain/);
    });

    test.each([false, true])(
        "uses a derived parameter's original binding when a later declaration shadows it (%s)",
        async (parentUsesLayout) => {
            const parent = {
                name: "p",
                expr: parentUsesLayout ? "width" : "2",
            };
            const shadow = {
                name: "p",
                expr: parentUsesLayout ? "2" : "width",
            };
            const launch = createHeadlessEngine({
                params: [parent],
                vconcat: [
                    {
                        params: [{ name: "show", expr: "p > 0" }, shadow],
                        visible: { expr: "show" },
                        mark: "point",
                        data: { values: [{}] },
                    },
                ],
            });
            if (parentUsesLayout)
                await expect(launch).rejects.toThrow(/visible.expr/);
            else {
                const { view } = await launch;
                expect(view.isConfiguredVisible()).toBe(true);
                view.disposeSubtree();
            }
        }
    );

    test.each([false, true])(
        "zooms a sequence track across its visibility threshold (initially visible: %s)",
        async (initiallyVisible) => {
            const { view: root } = await createHeadlessEngine({
                scales: {
                    x: {
                        type: "locus",
                        assembly: { contigs: [{ name: "chr1", size: 100000 }] },
                        zoom: true,
                        ...(initiallyVisible ? { domain: [0, 9000] } : {}),
                    },
                },
                params: [{ name: "bases", expr: "span(domain('x'))" }],
                vconcat: [
                    {
                        name: "sequence",
                        visible: {
                            expr: initiallyVisible
                                ? "bases < 10000"
                                : "span(domain('x')) < 10000",
                        },
                        mark: "point",
                        data: { values: [{}] },
                    },
                ],
            });
            onTestFinished(() => root.disposeSubtree());
            const detail = root
                .getDescendants()
                .find((view) => view.name === "sequence");
            expect(detail.isConfiguredVisible()).toBe(initiallyVisible);
            expect(!!detail.flowHandle).toBe(initiallyVisible);
            const scale = root.getScaleResolution("x");
            await scale.zoomTo([0, 5000], 0);
            await root.paramRuntime.whenPropagated();
            expect(detail.isConfiguredVisible()).toBe(true);
            await vi.waitFor(() =>
                expect(detail.flowHandle?.collector.getItemCount()).toBe(1)
            );
            const handle = detail.flowHandle;
            await scale.zoomTo([0, 9999], 0);
            expect(scale.getDomain()).toEqual([0, 10000]);
            await root.paramRuntime.whenPropagated();
            expect(detail.isConfiguredVisible()).toBe(false);
            await scale.zoomTo([0, 7000], 0);
            await root.paramRuntime.whenPropagated();
            expect(detail.isConfiguredVisible()).toBe(true);
            expect(detail.flowHandle).toBe(handle);
        }
    );

    test("restores loaded tracks to the shared domain and clears hidden root bounds", async () => {
        const { view: root } = await createHeadlessEngine({
            params: [{ name: "mode", value: "wide" }],
            visible: { expr: "mode !== 'hidden'" },
            resolve: { scale: { x: "shared" } },
            vconcat: [100, 10].map((x, i) => ({
                visible: {
                    expr: i === 0 ? "mode !== 'narrow'" : "mode !== 'wide'",
                },
                mark: "point",
                data: { values: [{ x }] },
                encoding: {
                    x: { field: "x", type: "quantitative" },
                },
            })),
        });
        onTestFinished(() => root.disposeSubtree());
        const x = root.getScaleResolution("x");
        expect(x.getDomain()).toEqual([0, 100]);
        root.paramRuntime.setValue("mode", "narrow");
        await vi.waitFor(() => expect(x.getDomain()).toEqual([0, 10]));
        root.paramRuntime.setValue("mode", "both");
        await vi.waitFor(() => expect(x.getDomain()).toEqual([0, 100]));
        renderToLayout(root);
        expect(root.coords).toBeDefined();
        root.paramRuntime.setValue("mode", "hidden");
        await root.paramRuntime.whenPropagated();
        renderToLayout(root);
        expect(root.coords).toBeUndefined();
    });

    test("reconciles visibility changed while startup awaits fonts", async () => {
        const context = createTestViewContext();
        const root = await context.createOrImportView(
            {
                params: [{ name: "showDetail", value: false }],
                vconcat: [
                    {
                        name: "detail",
                        visible: { expr: "showDetail" },
                        data: { values: [{ value: 1 }] },
                        mark: "point",
                    },
                ],
            },
            null,
            null,
            "root"
        );
        const fonts = Promise.withResolvers();
        vi.spyOn(context.textMetrics, "waitUntilReady").mockReturnValueOnce(
            fonts.promise
        );
        const launch = initializeViewData(
            root,
            context.dataFlow,
            context.textMetrics,
            () => {}
        );
        root.paramRuntime.setValue("showDetail", true);
        await root.paramRuntime.whenPropagated();
        fonts.resolve();
        await launch;
        const detail = root
            .getDescendants()
            .find((view) => view.name === "detail");
        expect(detail.flowHandle.collector.getItemCount()).toBe(1);
        root.disposeSubtree();
    });

    test("skips hidden subtrees during initial data initialization", async () => {
        const context = createTestViewContext();

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
            context.textMetrics,
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
            context.textMetrics,
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
            context.textMetrics
        );

        expect(hiddenView?.flowHandle?.collector).toBeDefined();
        expect(hiddenView?.getDataInitializationState()).toBe("ready");
        expect(visibleView?.flowHandle?.collector).toBe(visibleCollector);
    });

    test("loads transformed coordinate lookup data for newly visible views", async () => {
        const unregister = registerLazyDataSource(
            (params) => /** @type {any} */ (params).type == "mockLazy",
            MockLazySource
        );
        const loadSpy = vi.spyOn(MockLazySource.prototype, "load");

        try {
            const context = createTestViewContext();

            /** @type {import("../spec/root.js").RootSpec} */
            const spec = {
                assembly: "hg38",
                data: { values: [{ chrom: "chr1", pos: 100, base: "A" }] },
                vconcat: [
                    {
                        name: "visible",
                        mark: "point",
                        encoding: {
                            x: {
                                chrom: "chrom",
                                pos: "pos",
                                type: "locus",
                            },
                        },
                    },
                    {
                        name: "hidden",
                        visible: false,
                        transform: [
                            {
                                type: "coordinateLookup",
                                from: {
                                    data: {
                                        lazy: /** @type {any} */ ({
                                            type: "mockLazy",
                                            channel: "x",
                                        }),
                                    },
                                    transform: [
                                        {
                                            type: "formula",
                                            expr: "datum.start",
                                            as: "pos",
                                        },
                                    ],
                                },
                                key: ["chrom", "pos"],
                                values: ["score"],
                            },
                        ],
                        mark: "point",
                        encoding: {
                            x: {
                                chrom: "chrom",
                                pos: "pos",
                                type: "locus",
                            },
                            y: { field: "score", type: "quantitative" },
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
                context.textMetrics,
                () => undefined
            );

            context.isViewConfiguredVisible = () => true;
            await initializeVisibleViewData(
                root,
                context.dataFlow,
                context.textMetrics
            );

            // The side branch has a formula between its source and collector.
            expect(loadSpy).toHaveBeenCalledTimes(1);
        } finally {
            loadSpy.mockRestore();
            unregister();
        }
    });

    test("shared sources do not add duplicate observers for existing views", async () => {
        const context = createTestViewContext();
        context.getNamedDataFromProvider = () => [{ x: 1 }, { x: 2 }];

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
            context.textMetrics,
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
            context.textMetrics
        );

        expect(initializeSpy).toHaveBeenCalledTimes(1);
        initializeSpy.mockRestore();
    });

    test("waits for measureText custom fonts before loading data", async () => {
        const context = createTestViewContext();

        let ready = false;
        /** @type {(() => void) | undefined} */
        let resolveFont;
        let fontRequest;
        const fontReady = new Promise((resolve) => {
            resolveFont = () => {
                ready = true;
                resolve();
            };
        });

        const textMetrics = /** @type {any} */ ({
            requestFont: (/** @type {any} */ config) => {
                fontRequest = config;
                return {
                    measureWidth: (
                        /** @type {string} */ text,
                        /** @type {number} */ size
                    ) => (ready ? text.length * size : 0),
                    getHeight: () => 0,
                };
            },
            waitUntilReady: () => fontReady,
        });
        context.textMetrics = textMetrics;

        /** @type {import("../spec/view.js").UnitSpec} */
        const spec = {
            data: { values: [{ label: "abcd" }] },
            transform: [
                {
                    type: "measureText",
                    field: "label",
                    font: "Roboto Condensed",
                    fontStyle: "italic",
                    fontWeight: "bold",
                    fontSize: 6,
                    as: "width",
                },
            ],
            mark: "point",
            encoding: {
                x: { field: "width", type: "quantitative" },
            },
        };

        const root = await context.createOrImportView(spec, null, null, "root");
        const initPromise = initializeViewData(
            root,
            context.dataFlow,
            context.textMetrics,
            () => undefined
        );

        expect(fontRequest).toEqual({
            type: "measureText",
            field: "label",
            font: "Roboto Condensed",
            fontStyle: "italic",
            fontWeight: "bold",
            fontSize: 6,
            as: "width",
        });

        let initialized = false;
        initPromise.then(() => {
            initialized = true;
        });
        await Promise.resolve();
        expect(initialized).toBe(false);

        // Simulate the async font loader filling in metrics before init resumes.
        if (!resolveFont) {
            throw new Error("Expected the font manager to expose a resolver.");
        }
        const resolvePendingFont = resolveFont;
        resolvePendingFont();
        await initPromise;

        const collector = root.flowHandle?.collector;
        const datum = collector ? [...collector.getData()][0] : undefined;
        expect(datum?.width).toBe(24);
    });

    test("invalidates layout size cache after fonts become ready", async () => {
        const context = createTestViewContext();
        const textMetrics = /** @type {any} */ ({
            requestFont: context.textMetrics.requestFont.bind(
                context.textMetrics
            ),
            waitUntilReady: vi.fn(async () => undefined),
        });
        context.textMetrics = textMetrics;

        /** @type {import("../spec/view.js").VConcatSpec} */
        const spec = {
            vconcat: [
                {
                    name: "titled",
                    title: { text: "Custom font title", font: "Custom" },
                    data: { values: [{ x: 1, y: 2 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative", axis: null },
                        y: { field: "y", type: "quantitative", axis: null },
                    },
                },
            ],
        };

        const root = await context.createOrImportView(spec, null, null, "root");
        root.getSize();
        const invalidateSizeCache = vi.spyOn(root, "invalidateSizeCache");

        await initializeViewData(
            root,
            context.dataFlow,
            context.textMetrics,
            () => undefined
        );

        expect(textMetrics.waitUntilReady).toHaveBeenCalled();
        expect(invalidateSizeCache).toHaveBeenCalled();
    });

    test("initial data load notifies semantic marks", async () => {
        const context = createTestViewContext();

        /** @type {import("../spec/view.js").UnitSpec} */
        const spec = {
            data: { values: [{ x: 1 }] },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
            },
        };

        const root = await context.createOrImportView(spec, null, null, "root");
        if (!(root instanceof UnitView)) {
            throw new Error("Expected a unit view.");
        }

        const initializeData = vi.spyOn(root.mark, "initializeData");

        await initializeViewData(
            root,
            context.dataFlow,
            context.textMetrics,
            () => undefined
        );

        expect(initializeData).toHaveBeenCalledOnce();
    });

    test("new views join side inputs while replaying completed parent data", async () => {
        const context = createTestViewContext();

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
            context.textMetrics,
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
            transform: [
                {
                    type: "lookup",
                    from: {
                        values: [
                            { x: 1, label: "A" },
                            { x: 2, label: "B" },
                        ],
                    },
                    key: "x",
                    fields: ["x"],
                    values: ["label"],
                },
            ],
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
            context.textMetrics
        );

        // The new collector should have data even though the data source
        // was not reloaded.
        const summaryCollector = summaryView.flowHandle?.collector;
        expect(summaryCollector).toBeDefined();
        expect(summaryCollector?.completed).toBe(true);
        expect(Array.from(summaryCollector.getData())).toMatchObject([
            { x: 1, label: "A" },
            { x: 2, label: "B" },
        ]);
        expect(loadSpy).not.toHaveBeenCalled();

        loadSpy.mockRestore();
    });

    test("new views load side inputs before reloading an uncached inherited source", async () => {
        const context = createTestViewContext();
        const fetch = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(
                new Response(JSON.stringify([{ x: 1, label: "A" }]))
            );
        onTestFinished(() => fetch.mockRestore());
        const root = /** @type {ConcatView} */ (
            await context.createOrImportView(
                {
                    data: { values: [{ x: 1 }] },
                    vconcat: [
                        {
                            visible: false,
                            transform: [
                                {
                                    type: "lookup",
                                    from: {
                                        url: "https://example.test/lookup.json",
                                    },
                                    key: "x",
                                    fields: ["x"],
                                    values: ["label"],
                                },
                            ],
                            mark: "point",
                        },
                    ],
                },
                null,
                null,
                "root"
            )
        );
        onTestFinished(() => root.disposeSubtree());
        await initializeViewData(
            root,
            context.dataFlow,
            context.textMetrics,
            () => undefined
        );

        // The source loaded while its only consumer was hidden, so no cache exists.
        root.children[0].spec.visible = true;
        await initializeVisibleViewData(
            root,
            context.dataFlow,
            context.textMetrics
        );

        expect(
            Array.from(root.children[0].flowHandle.collector.getData())
        ).toMatchObject([{ x: 1, label: "A" }]);
    });

    test("a branch attached during a load receives all rows after the font wait", async () => {
        const context = createTestViewContext();
        const root = /** @type {ConcatView} */ (
            await context.createOrImportView(
                {
                    data: { values: [{ x: 1 }, { x: 2 }] },
                    vconcat: [
                        { mark: "point" },
                        { mark: "point", visible: false },
                    ],
                },
                null,
                null,
                "root"
            )
        );
        onTestFinished(() => root.disposeSubtree());
        await initializeViewData(
            root,
            context.dataFlow,
            context.textMetrics,
            () => undefined
        );

        // The inserted collector sees only the tail of this interrupted stream.
        const started = Promise.withResolvers();
        const finish = Promise.withResolvers();
        const source = root.flowHandle.dataSource;
        const load = vi
            .spyOn(source, "load")
            .mockImplementationOnce(async () => {
                source.reset();
                source.beginBatch({ type: "file" });
                for (const child of source.children) child.handle({ x: 1 });
                started.resolve(undefined);
                await finish.promise;
                for (const child of source.children) child.handle({ x: 2 });
                source.complete();
            });
        const loading = loadViewSubtreeData(root, new Set([source]));
        await started.promise;
        vi.spyOn(context.textMetrics, "waitUntilReady").mockImplementationOnce(
            async () => {
                finish.resolve(undefined);
                await loading;
            }
        );
        root.children[1].spec.visible = true;
        await initializeVisibleViewData(
            root,
            context.dataFlow,
            context.textMetrics
        );

        expect(
            Array.from(root.children[1].flowHandle.collector.getData())
        ).toMatchObject([{ x: 1 }, { x: 2 }]);
        expect(load).toHaveBeenCalledTimes(2);
    });

    test("lazy init does not reinitialize existing flow nodes", async () => {
        const context = createTestViewContext();
        context.getNamedDataFromProvider = () => [{ x: 1 }, { x: 2 }];

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
                context.textMetrics,
                () => undefined
            );

            // Only the visible branch should initialize at first.
            expect(initCalls).toBe(1);

            context.isViewConfiguredVisible = () => true;

            await initializeVisibleViewData(
                root,
                context.dataFlow,
                context.textMetrics
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
            context.textMetrics,
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
