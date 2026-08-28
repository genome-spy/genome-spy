// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createWebGLRenderingBackend: vi.fn(),
    createCanvas2DRenderingBackend: vi.fn(),
    createWebGpuRenderingBackend: vi.fn(),
    warnOnce: vi.fn(),
}));

vi.mock("./webgl/index.js", () => ({
    createWebGLRenderingBackend: mocks.createWebGLRenderingBackend,
}));

vi.mock("./canvas2d/index.js", () => ({
    createCanvas2DRenderingBackend: mocks.createCanvas2DRenderingBackend,
}));

vi.mock("./webgpu/index.js", () => ({
    createWebGpuRenderingBackend: mocks.createWebGpuRenderingBackend,
}));

vi.mock("../utils/warning.js", () => ({
    warnOnce: mocks.warnOnce,
}));

import { createRenderingBackend } from "./renderingBackend.js";

const baseOptions = {
    renderer: /** @type {const} */ ("auto"),
    sizeSource: () => ({ width: 100, height: 50 }),
    powerPreference: /** @type {const} */ ("default"),
    onCanvasResize: /** @returns {void} */ () => undefined,
    onRenderInvalidated: /** @returns {void} */ () => undefined,
};

describe("createRenderingBackend", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    test("loads WebGL without loading Canvas2D when WebGL is available", async () => {
        const container = document.createElement("div");
        const webGlBackend = /** @type {any} */ ({ surface: {} });
        mocks.createWebGLRenderingBackend.mockReturnValue(webGlBackend);

        const backend = await createRenderingBackend({
            ...baseOptions,
            container,
        });

        expect(backend).toBe(webGlBackend);
        expect(mocks.createWebGLRenderingBackend).toHaveBeenCalledWith({
            ...baseOptions,
            container,
        });
        expect(mocks.createCanvas2DRenderingBackend).not.toHaveBeenCalled();
    });

    test("loads Canvas2D directly without requesting WebGL", async () => {
        const container = document.createElement("div");
        const canvasBackend = /** @type {any} */ ({ surface: {} });
        mocks.createCanvas2DRenderingBackend.mockReturnValue(canvasBackend);

        const backend = await createRenderingBackend({
            ...baseOptions,
            renderer: "canvas",
            container,
        });

        expect(backend).toBe(canvasBackend);
        expect(mocks.createWebGLRenderingBackend).not.toHaveBeenCalled();
    });

    test("loads WebGPU directly without requesting another renderer", async () => {
        const container = document.createElement("div");
        const webGpuBackend = /** @type {any} */ ({ surface: {} });
        mocks.createWebGpuRenderingBackend.mockResolvedValue(webGpuBackend);

        const backend = await createRenderingBackend({
            ...baseOptions,
            renderer: "webgpu",
            container,
        });

        expect(backend).toBe(webGpuBackend);
        expect(mocks.createWebGpuRenderingBackend).toHaveBeenCalledWith({
            ...baseOptions,
            renderer: "webgpu",
            container,
        });
        expect(mocks.createWebGLRenderingBackend).not.toHaveBeenCalled();
        expect(mocks.createCanvas2DRenderingBackend).not.toHaveBeenCalled();
    });

    test("preserves an explicitly requested WebGPU failure", async () => {
        const failure = new Error("No WebGPU");
        mocks.createWebGpuRenderingBackend.mockRejectedValue(failure);

        await expect(
            createRenderingBackend({
                ...baseOptions,
                renderer: "webgpu",
                container: document.createElement("div"),
            })
        ).rejects.toBe(failure);
        expect(mocks.createWebGLRenderingBackend).not.toHaveBeenCalled();
        expect(mocks.createCanvas2DRenderingBackend).not.toHaveBeenCalled();
    });

    test("falls back to Canvas2D when automatic WebGL creation fails", async () => {
        const failure = new Error("No WebGL2");
        const canvasBackend = /** @type {any} */ ({ surface: {} });
        mocks.createWebGLRenderingBackend.mockImplementation(() => {
            throw failure;
        });
        mocks.createCanvas2DRenderingBackend.mockReturnValue(canvasBackend);

        const backend = await createRenderingBackend({
            ...baseOptions,
            container: document.createElement("div"),
        });

        expect(backend).toBe(canvasBackend);
        expect(mocks.warnOnce).toHaveBeenCalledOnce();
    });

    test("preserves an explicitly requested WebGL failure", async () => {
        const failure = new Error("No WebGL2");
        mocks.createWebGLRenderingBackend.mockImplementation(() => {
            throw failure;
        });

        await expect(
            createRenderingBackend({
                ...baseOptions,
                renderer: "webgl",
                container: document.createElement("div"),
            })
        ).rejects.toBe(failure);
        expect(mocks.createCanvas2DRenderingBackend).not.toHaveBeenCalled();
    });
});
