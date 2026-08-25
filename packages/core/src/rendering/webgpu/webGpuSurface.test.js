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
    };
    return {
        handle,
        placementHandle,
        renderer,
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

beforeEach(() => {
    vi.clearAllMocks();
    mocks.handle.values = {
        size: { default: { set: vi.fn() } },
    };
    mocks.handle.extraValues = {};
    mocks.handle.scalarSlots = {};
    mocks.handle.selections = {};
});

describe("WebGpuSurface", () => {
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

        surface.useMark(mark, definition, createConfig(0), {
            viewport: { x: 0, y: 0, width: 100, height: 50 },
            placement: { source, index: 0 },
        });
        surface.beginFrame();
        surface.render();

        expect(mocks.renderer.createMark).toHaveBeenCalledOnce();
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

        surface.beginFrame();
        surface.useMark(mark, definition, createConfig(0));
        surface.render();
        surface.beginFrame();
        surface.useMark(mark, definition, createConfig(1));
        surface.render();

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
            draws: [{ mark: mocks.handle }],
        });
        expect(mocks.renderer.render).toHaveBeenNthCalledWith(2, {
            draws: [{ mark: mocks.handle }],
        });
        expect(mocks.renderer.destroyMark).not.toHaveBeenCalled();

        surface.finalize();
        expect(mocks.renderer.destroy).toHaveBeenCalledOnce();
        expect(mocks.renderer.destroyMark).not.toHaveBeenCalled();
        onInvalidate();
        expect(onRenderInvalidated).not.toHaveBeenCalled();
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

        surface.beginFrame();
        surface.useMark(mark, definition, createTextConfig(["0.00000"]));
        surface.beginFrame();
        surface.useMark(mark, definition, createTextConfig(["-1.0", "1.0"]));

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

        surface.useMark(mark, definition, createConfig(0, x));
        surface.useMark(mark, definition, createConfig(1, x));

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

        surface.useMark(mark, definition, config);
        domain[0] = 1;
        domain[1] = 11;
        size = 6;
        surface.useMark(mark, definition, config);

        expect(mocks.renderer.createMark).toHaveBeenCalledOnce();
        expect(mocks.handle.scales.x.default.setDomain).toHaveBeenCalledOnce();
        expect(mocks.handle.scales.x.default.setDomain).toHaveBeenCalledWith([
            1, 11,
        ]);
        expect(mocks.handle.values.size.default.set).toHaveBeenCalledOnce();
        expect(mocks.handle.values.size.default.set).toHaveBeenCalledWith(6);
        expect(mocks.handle.series.replace).not.toHaveBeenCalled();
    });

    test("does not inspect series again when config identity is stable", async () => {
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
        const config = {
            count: 2,
            channels: {
                x: {
                    get data() {
                        return readSeries();
                    },
                    type: "f32",
                    scale: { domain: [0, 1], range: [0, 100] },
                },
            },
        };

        surface.updateMark(mark, definition, config);
        readSeries.mockClear();
        surface.updateMark(mark, definition, config);

        expect(readSeries).not.toHaveBeenCalled();
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

        surface.useMark(mark, definition, config(first));
        expect(selectionSet).toHaveBeenCalledWith(42);
        selectionSet.mockClear();

        mark.unitView.paramRuntime.findValue = () => ({
            type: "single",
            uniqueId: 43,
        });
        surface.useMark(mark, definition, config(second));

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
                targets: ["x", "y"],
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

        surface.useMark(mark, definition, createConfig(0));
        expect(selectionSet).toHaveBeenCalledWith({
            x: [1, 2],
            y: [3, 4],
        });
        selectionSet.mockClear();

        surface.useMark(mark, definition, createConfig(0));
        expect(selectionSet).not.toHaveBeenCalled();

        mark.unitView.paramRuntime.findValue = () => ({
            type: "interval",
            intervals: { x: [5, 6] },
        });
        surface.useMark(mark, definition, createConfig(0));

        expect(selectionSet).toHaveBeenCalledOnce();
        expect(selectionSet).toHaveBeenCalledWith({ x: [5, 6], y: null });
        selectionSet.mockClear();

        mark.unitView.paramRuntime.findValue = () => ({
            type: "interval",
            intervals: { x: null, y: null },
        });
        surface.useMark(mark, definition, createConfig(0));

        expect(selectionSet).toHaveBeenCalledOnce();
        expect(selectionSet).toHaveBeenCalledWith({ x: null, y: null });
    });

    test("retains literal conditional channels without creating a series", async () => {
        const selectionSet = vi.fn();
        mocks.handle.selections = {
            brush: {
                type: "interval",
                targets: ["x", "y"],
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
                                targets: [{ input: "x" }, { input: "y" }],
                            },
                            value: [1, 0, 0, 1],
                        },
                    ],
                },
            },
        };

        surface.useMark(mark, definition, config);
        surface.useMark(mark, definition, config);

        expect(mocks.renderer.createMark).toHaveBeenCalledOnce();
        expect(mocks.handle.series.replace).not.toHaveBeenCalled();
        expect(selectionSet).toHaveBeenCalledOnce();
    });

    test("updates a live conditional value through its retained slot", async () => {
        const conditionalSet = vi.fn();
        /** @type {any} */ (mocks.handle.values).fill = {
            conditions: { chosen: { set: conditionalSet } },
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
                                get value() {
                                    return value;
                                },
                            },
                        },
                    ],
                },
            },
        };

        surface.useMark(mark, definition, config);
        value = 0.75;
        surface.useMark(mark, definition, config);

        const rendererConfig = /** @type {any[][]} */ (
            mocks.renderer.createMark.mock.calls
        )[0][1];
        expect(rendererConfig.channels.fill.conditions[0].channel.dynamic).toBe(
            true
        );
        expect(conditionalSet).toHaveBeenCalledOnce();
        expect(conditionalSet).toHaveBeenCalledWith(0.75);
    });

    test("updates dynamic extra uniforms without recreating a mark", async () => {
        const headWidthSet = vi.fn();
        mocks.handle.extraValues = {
            uHeadWidth: { set: headWidthSet },
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
        /** @param {number} value */
        const config = (value) => ({
            count: 1,
            channels: {},
            dynamicValues: { uHeadWidth: { value } },
        });

        surface.useMark(mark, definition, config(3));
        surface.useMark(mark, definition, config(5));

        expect(headWidthSet).toHaveBeenCalledWith(5);
        expect(mocks.renderer.createMark).toHaveBeenCalledOnce();
    });

    test("updates retained extra uniforms when their values change", async () => {
        const viewportSet = vi.fn();
        mocks.handle.extraValues = { uViewport: { set: viewportSet } };
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
        const config = /** @param {number[]} viewport */ (viewport) => ({
            count: 1,
            channels: {},
            dynamicValues: { uViewport: { value: viewport } },
        });

        surface.useMark(mark, definition, config([10, 20, 110, 220]));
        surface.useMark(mark, definition, config([48, 16, 110, 220]));

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

        surface.useMark(mark, definition, config(0.5));
        surface.useMark(mark, definition, config(0.5));
        surface.useMark(mark, definition, config(0.75));

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

        surface.beginFrame();
        surface.useMark(mark, definition, createConfig(0));
        surface.render();
        surface.beginPickingFrame();
        surface.useMark(mark, definition, createConfig(0), { picking: true });
        surface.renderPicking();

        expect(mocks.renderer.render).toHaveBeenCalledWith({
            draws: [{ mark: mocks.handle }],
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
