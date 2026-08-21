// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const handle = {
        markId: 7,
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
        selections: {},
    };
    const renderer = {
        createMark: vi.fn(() => handle),
        updateGlobals: vi.fn(),
        destroyMark: vi.fn(),
        destroy: vi.fn(),
        render: vi.fn(),
    };
    return {
        handle,
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
    mocks.handle.selections = {};
});

describe("WebGpuSurface", () => {
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
