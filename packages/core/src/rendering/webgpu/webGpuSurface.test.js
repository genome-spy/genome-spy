// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const handle = {
        markId: 7,
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
    return {
        handle,
        renderer: {
            createMark: vi.fn(() => handle),
            updateSeries: vi.fn(),
            updateGlobals: vi.fn(),
            destroyMark: vi.fn(),
            render: vi.fn(),
        },
    };
});

vi.mock("@genome-spy/webgpu-renderer", () => ({
    createRenderer: vi.fn(async () => mocks.renderer),
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
});

describe("WebGpuSurface", () => {
    test("updates and reorders a retained mark without recreating it", async () => {
        const container = document.createElement("div");
        const surface = new WebGpuSurface(
            /** @type {any} */ ({
                container,
                sizeSource: {},
                onCanvasResize: vi.fn(),
            })
        );
        await surface.initialize();
        const mark = /** @type {import("../../marks/mark.js").default} */ (
            /** @type {unknown} */ ({})
        );
        const definition =
            /** @type {import("@genome-spy/webgpu-renderer").MarkDefinition<any>} */ (
                /** @type {unknown} */ ({ type: "point" })
            );

        surface.beginFrame();
        surface.useMark(mark, definition, createConfig(0));
        surface.render();
        surface.beginFrame();
        surface.useMark(mark, definition, createConfig(1));
        surface.render();

        expect(mocks.renderer.createMark).toHaveBeenCalledOnce();
        expect(mocks.renderer.updateSeries).toHaveBeenCalledOnce();
        expect(mocks.handle.scales.x.default.setDomain).toHaveBeenCalledWith([
            1, 11,
        ]);
        expect(mocks.handle.values.size.default.set).toHaveBeenCalledWith(6);
        expect(mocks.renderer.render).toHaveBeenNthCalledWith(1, [7]);
        expect(mocks.renderer.render).toHaveBeenNthCalledWith(2, [7]);
        expect(mocks.renderer.destroyMark).not.toHaveBeenCalled();

        surface.finalize();
        expect(mocks.renderer.destroyMark).toHaveBeenCalledWith(7);
    });
});

/** @param {number} offset */
function createConfig(offset) {
    return {
        count: 2,
        channels: {
            x: {
                data: new Float32Array([offset, offset + 1]),
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
