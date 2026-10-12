// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const handle = {
        markId: 7,
        batchUpdates: vi.fn((update) => update()),
        series: { replace: vi.fn() },
        scales: {
            x: {
                default: {
                    setDomain: vi.fn(),
                    setRange: vi.fn(),
                },
            },
        },
        values: {
            size: { default: { set: vi.fn() } },
        },
        properties: {},
        extraValues: {},
        scalarSlots: {},
        selections: {},
    };
    const placementHandle = {
        placementSetId: 11,
        count: 1,
        replace: vi.fn(),
        destroy: vi.fn(),
    };
    const renderer = {
        createMark: vi.fn(() => handle),
        createPlacementSet: vi.fn(() => placementHandle),
        updateGlobals: vi.fn(),
        destroyMark: vi.fn(),
        destroy: vi.fn(),
        render: vi.fn(),
        renderPicking: vi.fn(),
        pick: vi.fn(async () => 42),
        createDetachedTarget: vi.fn(),
    };
    const preview = {
        update: vi.fn(
            async (
                /** @type {ReadonlyArray<readonly [number, number]>} */ _points
            ) => {}
        ),
        renderSelection: vi.fn(async () => {}),
        render: vi.fn(),
        stop: vi.fn(),
        destroy: vi.fn(),
    };
    const table = { destroy: vi.fn() };
    const lasso = {
        table,
        update: vi.fn(),
        clear: vi.fn(),
        takeTable: vi.fn(() => table),
        readIds: vi.fn(async () => ({
            revision: 1,
            ids: new Uint32Array([7]),
            indices: new Uint32Array([0]),
        })),
        destroy: vi.fn(),
    };
    return {
        handle,
        placementHandle,
        renderer,
        preview,
        table,
        lasso,
        createPointLassoSelection: vi.fn(() => lasso),
        createPointDensityPreview: vi.fn((_renderer, _mark, options) => {
            options.draw();
            return preview;
        }),
        createRenderer: vi.fn(
            async (
                /** @type {HTMLCanvasElement} */ _canvas,
                /** @type {import("@genome-spy/webgpu-renderer").RendererOptions} */ _options
            ) => renderer
        ),
    };
});

vi.mock("@genome-spy/webgpu-renderer", () => ({
    createRenderer: mocks.createRenderer,
}));
vi.mock("@genome-spy/webgpu-renderer/marks/point", () => ({
    createPointDensityPreview: mocks.createPointDensityPreview,
    createPointLassoSelection: mocks.createPointLassoSelection,
}));

vi.mock("../canvasSizeHelper.js", () => ({
    default: class {
        invalidate() {}
        getLogicalCanvasSize() {
            return { width: 100, height: 50 };
        }
        getPhysicalCanvasSize() {
            return { width: 200, height: 100 };
        }
        getDevicePixelRatio() {
            return 2;
        }
        finalize() {}
    },
}));

import WebGpuSurface from "./webGpuSurface.js";
import { createPolygonPredicate } from "../../selection/polygon.js";

beforeEach(() => {
    vi.clearAllMocks();
    mocks.handle.values = {
        size: { default: { set: vi.fn() } },
    };
    mocks.handle.properties = {};
    mocks.handle.extraValues = {};
    mocks.handle.scalarSlots = {};
    mocks.handle.selections = {};
    mocks.renderer.createDetachedTarget.mockReset();
});

/**
 * @param {WebGpuSurface} surface
 * @param {any} mark
 * @param {any} definition
 * @param {any} config
 * @param {any} [options]
 * @param {Record<string, {value: any}>} [properties]
 */
function useMark(surface, mark, definition, config, options, properties) {
    configureMockMark(mark, definition);
    surface.updateMark(mark, definition, config, properties);
    const { placement, ...drawOptions } = options ?? {};
    const draw = {
        mark: mocks.handle,
        ...drawOptions,
        ...(placement
            ? {
                  placement: {
                      set: { placementSetId: -1 },
                      ...(placement.index === undefined
                          ? {}
                          : { index: placement.index }),
                      ...(placement.clipToPlacement
                          ? {
                                clipToPlacement: placement.clipToPlacement,
                            }
                          : {}),
                  },
              }
            : {}),
    };
    surface.prepareDraw(mark, draw, placement?.source);
    return draw;
}

/** @param {any} mark @param {any} definition */
function configureMockMark(mark, definition) {
    mark.unitView ??= {};
    mark.unitView.getPathString ??= () => "root/test-view";
    mark.getType ??= () => definition.type;
}

describe("WebGpuSurface", () => {
    test("submits export layouts with detached target dimensions", async () => {
        const detachedHandle = {
            render: vi.fn(),
            onSubmittedWorkDone: vi.fn(),
            destroy: vi.fn(),
        };
        mocks.renderer.createDetachedTarget.mockReturnValue(detachedHandle);
        const surface = new WebGpuSurface(
            /** @type {any} */ ({
                container: document.body,
                onCanvasResize: vi.fn(),
                onRenderInvalidated: vi.fn(),
            })
        );
        await surface.initialize();
        const liveMark = /** @type {any} */ ({});
        const liveDraw = useMark(
            surface,
            liveMark,
            /** @type {any} */ ({ type: "point" }),
            createConfig(0),
            { viewport: { x: 0, y: 0, width: 100, height: 50 } }
        );
        const target = surface.createExportTarget(80, 40, 3);
        /** @type {{width: number, height: number, dpr: number}[]} */
        const observedSizes = [];
        const layoutResult = {
            collectRenderCommands: vi.fn((context) => {
                observedSizes.push({
                    ...surface.getLogicalCanvasSize(),
                    dpr: context.getDevicePixelRatio(),
                });
            }),
        };
        const clearColor = { r: 0, g: 0, b: 0, a: 0 };

        surface.renderLayoutToTarget(
            /** @type {any} */ (layoutResult),
            target,
            clearColor
        );

        expect(target.canvas.width).toBe(240);
        expect(target.canvas.height).toBe(120);
        expect(mocks.renderer.createDetachedTarget).toHaveBeenCalledWith(
            target.canvas,
            { width: 80, height: 40, dpr: 3 }
        );
        expect(observedSizes).toEqual([{ width: 100, height: 50, dpr: 3 }]);
        expect(detachedHandle.render).toHaveBeenCalledWith({
            items: [],
            clearColor,
        });
        expect(surface.getLogicalCanvasSize()).toEqual({
            width: 100,
            height: 50,
        });
        expect(surface.getDevicePixelRatio()).toBe(2);
        surface.render([liveDraw]);
        expect(mocks.renderer.render).toHaveBeenCalledWith({
            items: [
                {
                    mark: mocks.handle,
                    viewport: { x: 0, y: 0, width: 100, height: 50 },
                },
            ],
        });
    });

    test("forwards unexpected device loss until the surface is finalized", async () => {
        const container = document.createElement("div");
        const onError = vi.fn();
        const surface = new WebGpuSurface(
            /** @type {any} */ ({
                container,
                sizeSource: {},
                onCanvasResize: vi.fn(),
                onRenderInvalidated: vi.fn(),
                onError,
            })
        );
        await surface.initialize();
        const onDeviceLoss = mocks.createRenderer.mock.calls[0][1].onDeviceLoss;
        const info = /** @type {GPUDeviceLostInfo} */ (
            /** @type {unknown} */ ({ reason: "unknown", message: "gone" })
        );

        onDeviceLoss(info);

        expect(onError).toHaveBeenCalledOnce();
        expect(onError.mock.calls[0][0]).toMatchObject({
            message: "WebGPU device was lost (unknown): gone",
        });

        surface.finalize();
        onDeviceLoss(info);
        expect(onError).toHaveBeenCalledOnce();
    });

    test("retains repeated mark placement through empty frames until owner disposal", async () => {
        const container = document.createElement("div");
        const surface = new WebGpuSurface(
            /** @type {any} */ ({
                container,
                sizeSource: {},
                onCanvasResize: vi.fn(),
                onRenderInvalidated: vi.fn(),
            })
        );
        await surface.initialize();
        let dispose = () => {};
        const mark = /** @type {any} */ ({
            unitView: {
                registerDisposer: (/** @type {() => void} */ disposer) => {
                    dispose = disposer;
                },
            },
        });
        const definition = /** @type {any} */ ({ type: "point" });
        const source = surface.updateOccurrencePlacements(
            mark,
            new Float32Array([0, 0, 1, 1])
        );

        useMark(surface, mark, definition, createConfig(0), {
            viewport: { x: 0, y: 0, width: 100, height: 50 },
            placement: { source, index: 0 },
        });

        expect(mocks.renderer.createMark).toHaveBeenCalledOnce();
        expect(mocks.renderer.createMark).toHaveBeenCalledWith(
            definition,
            expect.anything(),
            { label: "root/test-view [point]" }
        );
        expect(mocks.renderer.createPlacementSet).toHaveBeenCalledOnce();
        expect(mocks.renderer.destroyMark).not.toHaveBeenCalled();
        expect(mocks.placementHandle.destroy).not.toHaveBeenCalled();

        dispose();
        expect(mocks.renderer.destroyMark).toHaveBeenCalledWith(7);
        expect(mocks.placementHandle.destroy).toHaveBeenCalledOnce();
    });

    test("updates and reorders a retained mark without recreating it", async () => {
        const container = document.createElement("div");
        const onRenderInvalidated = vi.fn();
        const surface = new WebGpuSurface(
            /** @type {any} */ ({
                container,
                sizeSource: {},
                onCanvasResize: vi.fn(),
                onRenderInvalidated,
            })
        );
        await surface.initialize();
        const onInvalidate = mocks.createRenderer.mock.calls[0][1].onInvalidate;
        expect(onInvalidate).toEqual(expect.any(Function));
        onInvalidate();
        expect(onRenderInvalidated).toHaveBeenCalledOnce();
        onRenderInvalidated.mockClear();
        const mark = /** @type {import("../../marks/mark.js").default} */ (
            /** @type {unknown} */ ({})
        );
        const definition =
            /** @type {import("@genome-spy/webgpu-renderer").MarkDefinition<any, any>} */ (
                /** @type {unknown} */ ({ type: "point" })
            );

        const firstDraw = useMark(surface, mark, definition, createConfig(0));
        surface.render([firstDraw]);
        const secondDraw = useMark(surface, mark, definition, createConfig(1));
        surface.render([secondDraw]);

        expect(mocks.renderer.createMark).toHaveBeenCalledOnce();
        expect(mocks.handle.series.replace).toHaveBeenCalledOnce();
        expect(mocks.handle.series.replace).toHaveBeenCalledWith(
            { x: new Float32Array([1, 2]) },
            2
        );
        expect(mocks.handle.scales.x.default.setDomain).toHaveBeenCalledWith([
            1, 11,
        ]);
        expect(mocks.handle.scales.x.default.setRange).not.toHaveBeenCalled();
        expect(mocks.handle.values.size.default.set).toHaveBeenCalledWith(6);
        expect(mocks.renderer.render).toHaveBeenNthCalledWith(1, {
            items: [{ mark: mocks.handle }],
        });
        expect(mocks.renderer.render).toHaveBeenNthCalledWith(2, {
            items: [{ mark: mocks.handle }],
        });
        expect(mocks.renderer.destroyMark).not.toHaveBeenCalled();

        surface.finalize();
        expect(mocks.renderer.destroy).toHaveBeenCalledOnce();
        expect(mocks.renderer.destroyMark).not.toHaveBeenCalled();
        onInvalidate();
        expect(onRenderInvalidated).not.toHaveBeenCalled();
    });

    test("recreates a retained mark when its program key changes", async () => {
        const surface = new WebGpuSurface(
            /** @type {any} */ ({
                container: document.body,
                sizeSource: {},
                onCanvasResize: vi.fn(),
                onRenderInvalidated: vi.fn(),
            })
        );
        await surface.initialize();
        const mark = /** @type {any} */ ({});
        const definition = /** @type {any} */ ({
            type: "point",
            getProgramKey: (/** @type {any} */ config) => config.shape,
        });
        configureMockMark(mark, definition);

        surface.updateMark(mark, definition, {
            ...createConfig(0),
            shape: "circle",
        });
        surface.updateMark(mark, definition, {
            ...createConfig(0),
            shape: "square",
        });

        expect(mocks.renderer.createMark).toHaveBeenCalledTimes(2);
        expect(mocks.renderer.destroyMark).toHaveBeenCalledWith(7);
    });

    test("replaces logical text and position series on retained text marks", async () => {
        const container = document.createElement("div");
        const surface = new WebGpuSurface(
            /** @type {any} */ ({
                container,
                sizeSource: {},
                onCanvasResize: vi.fn(),
                onRenderInvalidated: vi.fn(),
            })
        );
        await surface.initialize();
        const mark = /** @type {import("../../marks/mark.js").default} */ (
            /** @type {unknown} */ ({})
        );
        const definition =
            /** @type {import("@genome-spy/webgpu-renderer").MarkDefinition<any, any>} */ (
                /** @type {unknown} */ ({ type: "text" })
            );

        useMark(surface, mark, definition, createTextConfig(["0.00000"]));
        useMark(surface, mark, definition, createTextConfig(["-1.0", "1.0"]));

        expect(mocks.renderer.createMark).toHaveBeenCalledOnce();
        expect(mocks.handle.series.replace).toHaveBeenCalledWith(
            {
                text: ["-1.0", "1.0"],
                x: new Float32Array([10, 20]),
            },
            2
        );
    });

    test("retains series when only scales and values change", async () => {
        const container = document.createElement("div");
        const surface = new WebGpuSurface(
            /** @type {any} */ ({
                container,
                sizeSource: {},
                onCanvasResize: vi.fn(),
                onRenderInvalidated: vi.fn(),
            })
        );
        await surface.initialize();
        const mark = /** @type {import("../../marks/mark.js").default} */ (
            /** @type {unknown} */ ({})
        );
        const definition =
            /** @type {import("@genome-spy/webgpu-renderer").MarkDefinition<any, any>} */ (
                /** @type {unknown} */ ({ type: "point" })
            );
        const x = new Float32Array([1, 2]);

        useMark(surface, mark, definition, createConfig(0, x));
        useMark(surface, mark, definition, createConfig(1, x));

        expect(mocks.handle.series.replace).not.toHaveBeenCalled();
        expect(mocks.handle.scales.x.default.setDomain).toHaveBeenCalledWith([
            1, 11,
        ]);
        expect(mocks.handle.values.size.default.set).toHaveBeenCalledWith(6);
    });

    test("reads live channel leaves from a retained config object", async () => {
        const container = document.createElement("div");
        const surface = new WebGpuSurface(
            /** @type {any} */ ({
                container,
                sizeSource: {},
                onCanvasResize: vi.fn(),
                onRenderInvalidated: vi.fn(),
            })
        );
        await surface.initialize();
        const mark = /** @type {import("../../marks/mark.js").default} */ (
            /** @type {unknown} */ ({})
        );
        const definition =
            /** @type {import("@genome-spy/webgpu-renderer").MarkDefinition<any, any>} */ (
                /** @type {unknown} */ ({ type: "point" })
            );
        const domain = [0, 10];
        let size = 5;
        const config = {
            count: 2,
            channels: {
                x: {
                    data: new Float32Array([1, 2]),
                    type: "f32",
                    scale: {
                        get domain() {
                            return domain;
                        },
                        range: [0, 100],
                    },
                },
                size: {
                    get value() {
                        return size;
                    },
                },
            },
        };

        useMark(surface, mark, definition, config);
        domain[0] = 1;
        domain[1] = 11;
        size = 6;
        useMark(surface, mark, definition, config);

        expect(mocks.renderer.createMark).toHaveBeenCalledOnce();
        expect(mocks.handle.scales.x.default.setDomain).toHaveBeenCalledOnce();
        expect(mocks.handle.scales.x.default.setDomain).toHaveBeenCalledWith([
            1, 11,
        ]);
        expect(mocks.handle.values.size.default.set).toHaveBeenCalledOnce();
        expect(mocks.handle.values.size.default.set).toHaveBeenCalledWith(6);
        expect(mocks.handle.series.replace).not.toHaveBeenCalled();
    });

    test("does not inspect config structure again when identity is stable", async () => {
        const container = document.createElement("div");
        const surface = new WebGpuSurface(
            /** @type {any} */ ({
                container,
                sizeSource: {},
                onCanvasResize: vi.fn(),
                onRenderInvalidated: vi.fn(),
            })
        );
        await surface.initialize();
        const mark = /** @type {import("../../marks/mark.js").default} */ (
            /** @type {unknown} */ ({})
        );
        const definition =
            /** @type {import("@genome-spy/webgpu-renderer").MarkDefinition<any, any>} */ (
                /** @type {unknown} */ ({ type: "point" })
            );
        const series = new Float32Array([1, 2]);
        const readSeries = vi.fn(() => series);
        const inspectChannels = vi.fn();
        const config = {
            count: 2,
            channels: new Proxy(
                {
                    x: {
                        get data() {
                            return readSeries();
                        },
                        type: "f32",
                        scale: { domain: [0, 1], range: [0, 100] },
                    },
                },
                {
                    ownKeys: (target) => {
                        inspectChannels();
                        return Reflect.ownKeys(target);
                    },
                }
            ),
        };

        configureMockMark(mark, definition);
        surface.updateMark(mark, definition, config);
        readSeries.mockClear();
        inspectChannels.mockClear();
        surface.updateMark(mark, definition, config);

        expect(readSeries).not.toHaveBeenCalled();
        expect(inspectChannels).not.toHaveBeenCalled();
        expect(mocks.handle.series.replace).not.toHaveBeenCalled();
    });

    test("skips semantically unchanged nested scale ranges", async () => {
        const container = document.createElement("div");
        const surface = new WebGpuSurface(
            /** @type {any} */ ({
                container,
                sizeSource: {},
                onCanvasResize: vi.fn(),
                onRenderInvalidated: vi.fn(),
            })
        );
        await surface.initialize();
        const mark = /** @type {import("../../marks/mark.js").default} */ (
            /** @type {unknown} */ ({})
        );
        const definition =
            /** @type {import("@genome-spy/webgpu-renderer").MarkDefinition<any, any>} */ (
                /** @type {unknown} */ ({ type: "point" })
            );
        const x = new Float32Array([1, 2]);
        /** @param {number[][]} range */
        const config = (range) => ({
            count: 2,
            channels: {
                x: {
                    data: x,
                    type: "f32",
                    scale: { domain: [0, 1], range },
                },
            },
        });

        configureMockMark(mark, definition);
        surface.updateMark(
            mark,
            definition,
            config([
                [0, 0, 0, 1],
                [1, 1, 1, 1],
            ])
        );
        surface.updateMark(
            mark,
            definition,
            config([
                [0, 0, 0, 1],
                [1, 1, 1, 1],
            ])
        );

        expect(mocks.handle.scales.x.default.setDomain).not.toHaveBeenCalled();
        expect(mocks.handle.scales.x.default.setRange).not.toHaveBeenCalled();
        expect(mocks.handle.series.replace).not.toHaveBeenCalled();

        surface.updateMark(
            mark,
            definition,
            config([
                [0, 0, 0, 1],
                [1, 0, 0, 1],
            ])
        );
        expect(mocks.handle.scales.x.default.setRange).toHaveBeenCalledOnce();
    });

    test("updates selection slots and conditional series through retention", async () => {
        const selectionSet = vi.fn();
        mocks.handle.selections = {
            chosen: { type: "single", set: selectionSet },
        };
        const container = document.createElement("div");
        const surface = new WebGpuSurface(
            /** @type {any} */ ({
                container,
                sizeSource: {},
                onCanvasResize: vi.fn(),
                onRenderInvalidated: vi.fn(),
            })
        );
        await surface.initialize();
        const mark = /** @type {import("../../marks/mark.js").default} */ (
            /** @type {unknown} */ ({
                unitView: {
                    paramRuntime: {
                        findValue: () => ({ type: "single", uniqueId: 42 }),
                    },
                },
            })
        );
        const definition =
            /** @type {import("@genome-spy/webgpu-renderer").MarkDefinition<any, any>} */ (
                /** @type {unknown} */ ({ type: "point" })
            );
        const first = new Float32Array([1, 2]);
        const second = new Float32Array([3, 4]);
        /** @param {Float32Array} data */
        const config = (data) => ({
            count: 2,
            channels: {
                fill: {
                    value: [0, 0, 0, 1],
                    conditions: [
                        {
                            when: { selection: "chosen", type: "single" },
                            channel: { data, type: "f32", components: 4 },
                        },
                    ],
                },
            },
        });

        useMark(surface, mark, definition, config(first));
        expect(selectionSet).toHaveBeenCalledWith(42);
        selectionSet.mockClear();

        mark.unitView.paramRuntime.findValue = () => ({
            type: "single",
            uniqueId: 43,
        });
        useMark(surface, mark, definition, config(second));

        expect(selectionSet).toHaveBeenCalledWith(43);
        expect(mocks.handle.series.replace).toHaveBeenCalledWith(
            { fill: second },
            2
        );
    });

    test("updates all interval targets atomically and preserves inactive targets", async () => {
        const selectionSet = vi.fn();
        mocks.handle.selections = {
            brush: {
                type: "interval",
                components: ["x", "y"],
                set: selectionSet,
            },
        };
        const container = document.createElement("div");
        const surface = new WebGpuSurface(
            /** @type {any} */ ({
                container,
                sizeSource: {},
                onCanvasResize: vi.fn(),
                onRenderInvalidated: vi.fn(),
            })
        );
        await surface.initialize();
        const mark = /** @type {import("../../marks/mark.js").default} */ (
            /** @type {unknown} */ ({
                unitView: {
                    paramRuntime: {
                        findValue: () => ({
                            type: "interval",
                            intervals: { x: [1, 2], y: [3, 4] },
                        }),
                    },
                },
            })
        );
        const definition =
            /** @type {import("@genome-spy/webgpu-renderer").MarkDefinition<any, any>} */ (
                /** @type {unknown} */ ({ type: "point" })
            );

        useMark(surface, mark, definition, createConfig(0));
        expect(selectionSet).toHaveBeenCalledWith({
            x: [1, 2],
            y: [3, 4],
        });
        selectionSet.mockClear();

        useMark(surface, mark, definition, createConfig(0));
        expect(selectionSet).not.toHaveBeenCalled();

        mark.unitView.paramRuntime.findValue = () => ({
            type: "interval",
            intervals: { x: [5, 6] },
        });
        useMark(surface, mark, definition, createConfig(0));

        expect(selectionSet).toHaveBeenCalledOnce();
        expect(selectionSet).toHaveBeenCalledWith({ x: [5, 6], y: null });
        selectionSet.mockClear();

        mark.unitView.paramRuntime.findValue = () => ({
            type: "interval",
            intervals: { x: null, y: null },
        });
        useMark(surface, mark, definition, createConfig(0));

        expect(selectionSet).toHaveBeenCalledOnce();
        expect(selectionSet).toHaveBeenCalledWith({ x: null, y: null });
    });

    test("retains literal conditional channels without creating a series", async () => {
        const selectionSet = vi.fn();
        mocks.handle.selections = {
            brush: {
                type: "interval",
                components: ["x", "y"],
                set: selectionSet,
            },
        };
        const container = document.createElement("div");
        const surface = new WebGpuSurface(
            /** @type {any} */ ({
                container,
                sizeSource: {},
                onCanvasResize: vi.fn(),
                onRenderInvalidated: vi.fn(),
            })
        );
        await surface.initialize();
        const mark = /** @type {import("../../marks/mark.js").default} */ (
            /** @type {unknown} */ ({
                unitView: {
                    paramRuntime: {
                        findValue: () => ({
                            type: "interval",
                            intervals: { x: [1, 2], y: [3, 4] },
                        }),
                    },
                },
            })
        );
        const definition =
            /** @type {import("@genome-spy/webgpu-renderer").MarkDefinition<any, any>} */ (
                /** @type {unknown} */ ({ type: "point" })
            );
        const config = {
            count: 1,
            channels: {
                fill: {
                    value: [0, 0, 0, 1],
                    conditions: [
                        {
                            when: {
                                selection: "brush",
                                type: "interval",
                                projections: [
                                    { component: "x", input: "x" },
                                    { component: "y", input: "y" },
                                ],
                            },
                            value: [1, 0, 0, 1],
                        },
                    ],
                },
            },
        };

        useMark(surface, mark, definition, config);
        useMark(surface, mark, definition, config);

        expect(mocks.renderer.createMark).toHaveBeenCalledOnce();
        expect(mocks.handle.series.replace).not.toHaveBeenCalled();
        expect(selectionSet).toHaveBeenCalledOnce();
    });

    test("updates an explicitly dynamic conditional value", async () => {
        const conditionalSet = vi.fn();
        /** @type {any} */ (mocks.handle.values).fill = {
            conditions: { 0: { set: conditionalSet } },
        };
        const container = document.createElement("div");
        const surface = new WebGpuSurface(
            /** @type {any} */ ({
                container,
                sizeSource: {},
                onCanvasResize: vi.fn(),
                onRenderInvalidated: vi.fn(),
            })
        );
        await surface.initialize();
        const mark = /** @type {import("../../marks/mark.js").default} */ (
            /** @type {unknown} */ ({})
        );
        const definition =
            /** @type {import("@genome-spy/webgpu-renderer").MarkDefinition<any, any>} */ (
                /** @type {unknown} */ ({ type: "point" })
            );
        let value = 0.25;
        const config = {
            count: 1,
            channels: {
                fill: {
                    value: 0,
                    conditions: [
                        {
                            when: { selection: "chosen", type: "single" },
                            channel: {
                                dynamic: true,
                                get value() {
                                    return value;
                                },
                            },
                        },
                    ],
                },
            },
        };

        useMark(surface, mark, definition, config);
        value = 0.75;
        useMark(surface, mark, definition, config);

        const rendererConfig = /** @type {any[][]} */ (
            mocks.renderer.createMark.mock.calls
        )[0][1];
        expect(rendererConfig.channels.fill.conditions[0].channel.dynamic).toBe(
            true
        );
        expect(conditionalSet).toHaveBeenCalledOnce();
        expect(conditionalSet).toHaveBeenCalledWith(0.75);
    });

    test("updates semantic properties without recreating a mark", async () => {
        const headWidthSet = vi.fn();
        mocks.handle.properties = {
            headWidth: { set: headWidthSet },
        };
        const container = document.createElement("div");
        const surface = new WebGpuSurface(
            /** @type {any} */ ({
                container,
                sizeSource: {},
                onCanvasResize: vi.fn(),
                onRenderInvalidated: vi.fn(),
            })
        );
        await surface.initialize();
        const mark = /** @type {import("../../marks/mark.js").default} */ (
            /** @type {unknown} */ ({})
        );
        const definition =
            /** @type {import("@genome-spy/webgpu-renderer").MarkDefinition<any, any>} */ (
                /** @type {unknown} */ ({ type: "arrow" })
            );
        const config = {
            count: 1,
            channels: {},
        };

        useMark(surface, mark, definition, config, undefined, {
            headWidth: { value: 3 },
        });
        useMark(surface, mark, definition, config, undefined, {
            headWidth: { value: 5 },
        });

        expect(headWidthSet).toHaveBeenCalledWith(5);
        expect(mocks.renderer.createMark).toHaveBeenCalledOnce();
    });

    test("updates retained semantic arrays when their values change", async () => {
        const viewportSet = vi.fn();
        mocks.handle.properties = { viewport: { set: viewportSet } };
        const container = document.createElement("div");
        const surface = new WebGpuSurface(
            /** @type {any} */ ({
                container,
                sizeSource: {},
                onCanvasResize: vi.fn(),
                onRenderInvalidated: vi.fn(),
            })
        );
        await surface.initialize();
        const mark = /** @type {import("../../marks/mark.js").default} */ (
            /** @type {unknown} */ ({})
        );
        const definition =
            /** @type {import("@genome-spy/webgpu-renderer").MarkDefinition<any, any>} */ (
                /** @type {unknown} */ ({ type: "text" })
            );
        const config = {
            count: 1,
            channels: {},
        };

        useMark(surface, mark, definition, config, undefined, {
            viewport: { value: [10, 20, 110, 220] },
        });
        useMark(surface, mark, definition, config, undefined, {
            viewport: { value: [48, 16, 110, 220] },
        });

        expect(viewportSet).toHaveBeenCalledWith([48, 16, 110, 220]);
        expect(mocks.renderer.createMark).toHaveBeenCalledOnce();
    });

    test("updates retained scalar slots without recreating a mark", async () => {
        const thresholdSet = vi.fn();
        mocks.handle.scalarSlots = {
            threshold: { set: thresholdSet },
        };
        const container = document.createElement("div");
        const surface = new WebGpuSurface(
            /** @type {any} */ ({
                container,
                sizeSource: {},
                onCanvasResize: vi.fn(),
                onRenderInvalidated: vi.fn(),
            })
        );
        await surface.initialize();
        const mark = /** @type {import("../../marks/mark.js").default} */ (
            /** @type {unknown} */ ({})
        );
        const definition =
            /** @type {import("@genome-spy/webgpu-renderer").MarkDefinition<any, any>} */ (
                /** @type {unknown} */ ({ type: "point" })
            );
        const x = new Float32Array([0, 1]);
        /** @param {number} value */
        const config = (value) => ({
            count: 2,
            channels: {
                x: { data: x, type: "f32" },
            },
            scalarSlots: {
                threshold: { value, type: "f32" },
            },
        });

        useMark(surface, mark, definition, config(0.5));
        useMark(surface, mark, definition, config(0.5));
        useMark(surface, mark, definition, config(0.75));

        expect(thresholdSet).toHaveBeenCalledOnce();
        expect(thresholdSet).toHaveBeenCalledWith(0.75);
        expect(mocks.renderer.createMark).toHaveBeenCalledOnce();
        expect(mocks.handle.series.replace).not.toHaveBeenCalled();
    });

    test("keeps picking draws separate from the visible frame", async () => {
        const container = document.createElement("div");
        const surface = new WebGpuSurface(
            /** @type {any} */ ({
                container,
                sizeSource: {},
                onCanvasResize: vi.fn(),
                onRenderInvalidated: vi.fn(),
            })
        );
        await surface.initialize();
        const mark = /** @type {import("../../marks/mark.js").default} */ (
            /** @type {unknown} */ ({})
        );
        const definition =
            /** @type {import("@genome-spy/webgpu-renderer").MarkDefinition<any, any>} */ (
                /** @type {unknown} */ ({ type: "point" })
            );

        const visibleDraw = useMark(surface, mark, definition, createConfig(0));
        surface.render([visibleDraw]);
        const pickingDraw = useMark(surface, mark, definition, createConfig(0));
        surface.renderPicking([pickingDraw]);

        expect(mocks.renderer.render).toHaveBeenCalledWith({
            items: [{ mark: mocks.handle }],
        });
        expect(mocks.renderer.renderPicking).toHaveBeenCalledWith({
            draws: [{ mark: mocks.handle }],
        });
        await expect(surface.pick(10, 20)).resolves.toBe(42);
        expect(mocks.renderer.pick).toHaveBeenCalledWith(10, 20);
    });
});

/**
 * @param {number} offset
 * @param {Float32Array} [x]
 */
function createConfig(offset, x = new Float32Array([offset, offset + 1])) {
    return {
        count: 2,
        channels: {
            x: {
                data: x,
                type: "f32",
                scale: {
                    domain: [offset, offset + 10],
                    range: [0, 100],
                },
            },
            size: { value: 5 + offset },
        },
    };
}

/** @param {string[]} text */
function createTextConfig(text) {
    return {
        count: text.length,
        channels: {
            text: { data: text },
            x: {
                data: new Float32Array([10, 20].slice(0, text.length)),
                type: "f32",
            },
            size: { value: 10 },
        },
    };
}

test.each(["multi", "region"])(
    "unchanged %s selections do not enumerate IDs on redraw",
    async (type) => {
        const selectionSet = vi.fn();
        mocks.handle.selections = {
            chosen: { type: "multi", set: selectionSet },
        };
        // Only the ID/activity contract is consumed by the retained slot.
        let selection = {
            type,
            status: "ready",
            data: new Map([
                [7, {}],
                [9, {}],
            ]),
        };
        const keys = vi.spyOn(selection.data, "keys");
        const surface = new WebGpuSurface(
            /** @type {any} */ ({
                container: document.createElement("div"),
                sizeSource: {},
                onCanvasResize: vi.fn(),
                onRenderInvalidated: vi.fn(),
            })
        );
        await surface.initialize();
        const mark = {
            unitView: { paramRuntime: { findValue: () => selection } },
        };
        const definition = { type: "point" };
        const config = createConfig(0);
        useMark(surface, mark, definition, config);
        expect(selectionSet).toHaveBeenCalledWith(
            new Uint32Array([7, 9]),
            true
        );
        useMark(surface, mark, definition, config);
        expect(keys).toHaveBeenCalledOnce();
        expect(selectionSet).toHaveBeenCalledOnce();
        // Multi-point updates reuse the Map but publish a new selection value.
        selection.data.delete(7);
        selection = { ...selection };
        useMark(surface, mark, definition, config);
        expect(selectionSet).toHaveBeenLastCalledWith(
            new Uint32Array([9]),
            true
        );
        selection = {
            ...selection,
            data: new Map(),
            status: type === "region" ? "ready" : "cleared",
        };
        useMark(surface, mark, definition, config);
        expect(selectionSet).toHaveBeenLastCalledWith(
            new Uint32Array(),
            type === "region"
        );
        surface.finalize();
    }
);

test("density drawing, commit, cancel, and unchanged frames reuse one image until scene invalidation", async () => {
    const surface = new WebGpuSurface({
        container: document.createElement("div"),
        sizeSource: () => ({ width: 100, height: 50 }),
        renderer: "webgpu",
        powerPreference: "default",
        onCanvasResize: vi.fn(),
        onError: vi.fn(),
    });
    await surface.initialize();
    let selection = { type: "region", status: "cleared", data: new Map() };
    mocks.handle.selections = { lasso: { type: "multi", set: vi.fn() } };
    const view = /** @type {any} */ ({
        coords: { x: 10, y: 10, width: 20, height: 10 },
        paramRuntime: { findValue: () => selection },
        registerDisposer: vi.fn(),
        getPathString: () => "density",
    });
    const mark = /** @type {any} */ ({
        unitView: view,
        getType: () => "point",
    });
    view.mark = mark;
    const definition = /** @type {any} */ ({ type: "point" });
    const config = {
        shape: "circle",
        count: 1,
        channels: {
            x: { data: new Float32Array([0.5]) },
            y: { data: new Float32Array([0.5]) },
            uniqueId: { data: new Uint32Array([1]) },
            fill: {
                value: [0.4, 0.46, 0.55, 1],
                conditions: [
                    {
                        when: {
                            selection: "lasso",
                            type: "multi",
                            empty: false,
                        },
                        channel: { value: [1, 0.35, 0.05, 1] },
                    },
                ],
            },
            strokeWidth: { value: 0 },
            gradientStrength: { value: 0 },
        },
    };
    surface.updateMark(mark, definition, config);
    const cancel = vi.fn();
    const visible = /** @type {any} */ ([{ mark: mocks.handle }]);
    expect(() =>
        surface.createRegionSelectionPreview(view, "lasso", cancel, [], {
            r: 1,
            g: 1,
            b: 1,
            a: 0,
        })
    ).toThrow("opaque white");
    expect(mocks.createPointDensityPreview).not.toHaveBeenCalled();
    expect(() =>
        surface.createRegionSelectionPreview(
            view,
            "lasso",
            cancel,
            [
                {
                    mark: {
                        markId: /** @type {import("@genome-spy/webgpu-renderer").MarkId} */ (
                            999
                        ),
                    },
                    viewport: { x: 10, y: 10, width: 20, height: 10 },
                },
            ],
            { r: 1, g: 1, b: 1, a: 1 }
        )
    ).toThrow("overlaid");
    expect(mocks.createPointDensityPreview).not.toHaveBeenCalled();
    const preview = surface.createRegionSelectionPreview(
        /** @type {any} */ (view),
        "lasso",
        cancel,
        visible,
        { r: 1, g: 1, b: 1, a: 1 }
    );
    expect(mocks.createPointDensityPreview.mock.calls[0][2]).toMatchObject({
        view: [10, 20, 30, 10],
        viewport: [20, 20, 40, 20],
        bounds: [10.5, 10.5, 30.5, 20.5],
    });
    const draws = mocks.renderer.render.mock.calls.length;
    preview.update([
        [10, 10],
        [20, 10],
        [20, 20],
    ]);
    expect(mocks.preview.update).toHaveBeenLastCalledWith([
        [10.5, 10.5],
        [20.5, 10.5],
        [20.5, 20.5],
    ]);
    // Quarter-pixel margins distinguish inside/outside near each edge after raster alignment.
    const contains = createPolygonPredicate(
        mocks.preview.update.mock.calls.at(-1)[0]
    );
    expect(
        [
            [19.75, 15],
            [20.25, 15],
            [15, 10.25],
            [15, 9.75],
            [15.25, 15],
            [14.75, 15],
        ].map(([x, y]) => contains(x + 0.5, y + 0.5))
    ).toEqual([true, false, true, false, true, false]);
    surface.render(visible);
    expect(mocks.renderer.render).toHaveBeenCalledTimes(draws);
    preview.stop();
    selection = { type: "region", status: "ready", data: new Map([[1, {}]]) };
    surface.updateMark(mark, definition, config);
    surface.render(visible);
    expect(mocks.preview.renderSelection).toHaveBeenLastCalledWith("lasso");
    const computes = mocks.preview.renderSelection.mock.calls.length;
    surface.render(visible);
    expect(mocks.preview.renderSelection).toHaveBeenCalledTimes(computes);
    expect(mocks.preview.render).toHaveBeenCalledOnce();
    expect(mocks.renderer.render).toHaveBeenCalledTimes(draws);

    preview.update([
        [10, 10],
        [20, 10],
        [20, 20],
    ]);
    preview.stop();
    surface.render(visible);
    expect(mocks.preview.renderSelection).toHaveBeenCalledTimes(computes + 1);
    const next = surface.createRegionSelectionPreview(
        /** @type {any} */ (view),
        "lasso",
        cancel,
        visible,
        { r: 1, g: 1, b: 1, a: 1 }
    );
    expect(mocks.createPointDensityPreview).toHaveBeenCalledOnce();
    next.update([[10, 10]]);
    surface.updateMark(mark, definition, {
        ...config,
        channels: {
            ...config.channels,
            x: { data: new Float32Array([0.75]) },
        },
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.preview.destroy).toHaveBeenCalledOnce();
    surface.render(visible);
    expect(mocks.renderer.render).toHaveBeenCalledTimes(draws + 1);
    surface.createRegionSelectionPreview(view, "lasso", cancel, visible, {
        r: 1,
        g: 1,
        b: 1,
        a: 1,
    });
    surface.render([]);
    expect(mocks.preview.destroy).toHaveBeenCalledTimes(2);

    // Empty sibling data skips retained updates, but its cached pixels must disappear.
    const sibling = /** @type {any} */ ({
        unitView: {
            registerDisposer: vi.fn(),
            getPathString: () => "sibling",
            facetCoords: new Map([
                [undefined, { x: 40, y: 10, width: 20, height: 10 }],
            ]),
        },
        getType: () => "point",
    });
    const siblingHandle = { ...mocks.handle, markId: 8 };
    mocks.renderer.createMark.mockReturnValueOnce(siblingHandle);
    surface.updateMark(sibling, definition, { count: 1, channels: {} });
    surface.createRegionSelectionPreview(
        view,
        "lasso",
        cancel,
        /** @type {any} */ ([...visible, { mark: siblingHandle }]),
        { r: 1, g: 1, b: 1, a: 1 }
    );
    const captures = mocks.renderer.render.mock.calls.length;
    surface.render(visible);
    expect(mocks.preview.destroy).toHaveBeenCalledTimes(3);
    expect(mocks.renderer.render).toHaveBeenCalledTimes(captures + 1);
    surface.finalize();
});

test("native GPU tables drive live encoding and committed redraws without CPU ID uploads", async () => {
    const surface = new WebGpuSurface({
        container: document.createElement("div"),
        sizeSource: () => ({ width: 100, height: 50 }),
        renderer: "webgpu",
        powerPreference: "default",
        onCanvasResize: vi.fn(),
        onError: vi.fn(),
    });
    await surface.initialize();
    // A restored selection has CPU membership but no native GPU table yet.
    let selection = {
        type: "region",
        status: "ready",
        data: new Map([[3, {}]]),
    };
    const previousKeys = vi.spyOn(selection.data, "keys");
    const other = { type: "multi", data: new Map([[9, {}]]) };
    const otherKeys = vi.spyOn(other.data, "keys");
    const slot = { type: "multi", set: vi.fn(), setGpuTable: vi.fn() };
    const otherSlot = { type: "multi", set: vi.fn(), setGpuTable: vi.fn() };
    mocks.handle.selections = { lasso: slot, other: otherSlot };
    const view = /** @type {any} */ ({
        paramRuntime: {
            findValue: (/** @type {string} */ name) =>
                name === "lasso" ? selection : other,
        },
        registerDisposer: vi.fn(),
        getPathString: () => "points",
    });
    const mark = /** @type {any} */ ({
        unitView: view,
        getType: () => "point",
    });
    view.mark = mark;
    const definition = /** @type {any} */ ({ type: "point" });
    const config = createConfig(0);
    surface.updateMark(mark, definition, config);
    slot.set.mockClear();
    otherSlot.set.mockClear();
    otherKeys.mockClear();
    previousKeys.mockClear();
    const session = surface.createRegionSelectionPreview(
        view,
        "lasso",
        vi.fn(),
        [],
        { r: 1, g: 1, b: 1, a: 1 },
        false
    );
    session.update([
        [0, 0],
        [1, 0],
        [0, 1],
    ]);
    expect(slot.setGpuTable).toHaveBeenCalledWith(mocks.table, true);
    // Cancellation restores the CPU table once; repeated cleanup is inert.
    session.stop();
    session.stop();
    expect(slot.set).toHaveBeenCalledExactlyOnceWith(
        new Uint32Array([3]),
        true
    );
    expect(previousKeys).toHaveBeenCalledOnce();
    slot.set.mockClear();
    previousKeys.mockClear();
    session.update([
        [0, 0],
        [1, 0],
        [0, 1],
    ]);
    surface.updateMark(mark, definition, config);
    const committed = {
        type: "region",
        status: "ready",
        data: new Map([[7, {}]]),
    };
    const keys = vi.spyOn(committed.data, "keys");
    session.commit(/** @type {any} */ (committed));
    selection = committed;
    session.stop();
    surface.updateMark(mark, definition, config);
    surface.invalidateRegionSelectionPreview();
    surface.render([]);
    expect(keys).not.toHaveBeenCalled();
    expect(previousKeys).not.toHaveBeenCalled();
    expect(slot.set).not.toHaveBeenCalled();
    expect(otherKeys).not.toHaveBeenCalled();
    expect(otherSlot.set).not.toHaveBeenCalled();
    expect(mocks.table.destroy).not.toHaveBeenCalled();
    const shared = selection;
    const consumer = /** @type {any} */ ({
        ...mark,
        unitView: {
            ...view,
            paramRuntime: {
                findValue: (/** @type {string} */ name) =>
                    name === "lasso" ? shared : other,
            },
        },
    });
    mocks.renderer.createMark.mockReturnValueOnce({
        ...mocks.handle,
        markId: 8,
    });
    surface.updateMark(consumer, definition, config);
    selection = { type: "region", status: "cleared", data: new Map() };
    surface.updateMark(mark, definition, config);
    surface.render([]);
    expect(mocks.table.destroy).not.toHaveBeenCalled();
    surface.finalize();
    expect(mocks.table.destroy).toHaveBeenCalledOnce();
});
