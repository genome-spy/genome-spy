// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createWebGLHelper: vi.fn(),
    createCanvas2DRenderingBackend: vi.fn(),
    readPickingPixel: vi.fn(),
    warnOnce: vi.fn(),
    exportCanvas: vi.fn(),
    exportRaster: vi.fn(),
}));

vi.mock("../gl/webGLHelper.js", () => ({
    default: class {
        /** @param {...any} args */
        constructor(...args) {
            return mocks.createWebGLHelper(...args);
        }
    },
    readPickingPixel: mocks.readPickingPixel,
}));

vi.mock("../canvas2d/index.js", () => ({
    createCanvas2DRenderingBackend: mocks.createCanvas2DRenderingBackend,
}));

vi.mock("../utils/warning.js", () => ({
    warnOnce: mocks.warnOnce,
}));

vi.mock("./canvasExport.js", () => ({
    exportCanvas: mocks.exportCanvas,
    exportRaster: mocks.exportRaster,
}));

import { createRenderingBackend } from "./renderingBackend.js";

const baseOptions = {
    renderer: /** @type {const} */ ("auto"),
    sizeSource: () => ({ width: 100, height: 50 }),
    powerPreference: /** @type {const} */ ("default"),
    onCanvasResize: /** @returns {void} */ () => undefined,
};

describe("createRenderingBackend", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    test("uses WebGL without loading Canvas2D when WebGL2 is available", async () => {
        const container = document.createElement("div");
        const glHelper = createGlHelper(container);
        mocks.createWebGLHelper.mockReturnValue(glHelper);

        const backend = await createRenderingBackend({
            ...baseOptions,
            container,
        });

        expect(backend.surface).toBe(glHelper);
        expect(backend.glHelper).toBe(glHelper);
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
        expect(mocks.createWebGLHelper).not.toHaveBeenCalled();
    });

    test("keeps WebGL picking behind the backend boundary", async () => {
        const container = document.createElement("div");
        const glHelper = createGlHelper(container);
        glHelper.getDevicePixelRatio = () => 2;
        mocks.createWebGLHelper.mockReturnValue(glHelper);
        mocks.readPickingPixel.mockReturnValue([1, 2, 3, 4]);

        const backend = await createRenderingBackend({
            ...baseOptions,
            container,
        });

        expect(backend.readPickingId?.(5, 7)).toBe(67_305_985);
        expect(mocks.readPickingPixel).toHaveBeenCalledWith(
            glHelper.gl,
            glHelper._pickingBufferInfo,
            10,
            14
        );
    });

    test("routes raster exports through the active WebGL backend", async () => {
        const container = document.createElement("div");
        const glHelper = createGlHelper(container);
        const viewRoot = /** @type {any} */ ({});
        const blob = new Blob();
        mocks.createWebGLHelper.mockReturnValue(glHelper);
        mocks.exportCanvas.mockReturnValue("data:image/png;base64,webgl");
        mocks.exportRaster.mockResolvedValue(blob);
        const backend = await createRenderingBackend({
            ...baseOptions,
            container,
        });

        expect(backend.exportCanvas({ viewRoot })).toBe(
            "data:image/png;base64,webgl"
        );
        await expect(backend.exportRaster({ viewRoot })).resolves.toBe(blob);
        expect(mocks.exportCanvas).toHaveBeenCalledWith({ viewRoot, glHelper });
        expect(mocks.exportRaster).toHaveBeenCalledWith({ viewRoot, glHelper });
    });

    test("preserves existing canvases when WebGL creation fails", async () => {
        const container = document.createElement("div");
        const existingCanvas = document.createElement("canvas");
        container.appendChild(existingCanvas);
        const canvasBackend = /** @type {any} */ ({ surface: {} });
        mocks.createWebGLHelper.mockImplementation(() => {
            throw new Error("No WebGL2");
        });
        mocks.createCanvas2DRenderingBackend.mockReturnValue(canvasBackend);

        const backend = await createRenderingBackend({
            ...baseOptions,
            container,
        });

        expect(backend).toBe(canvasBackend);
        expect(existingCanvas.parentElement).toBe(container);
        expect(mocks.warnOnce).toHaveBeenCalledOnce();
    });

    test("preserves an explicitly requested WebGL failure", async () => {
        const failure = new Error("No WebGL2");
        mocks.createWebGLHelper.mockImplementation(() => {
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

/**
 * @param {HTMLElement} container
 */
function createGlHelper(container) {
    const canvas = document.createElement("canvas");
    container.appendChild(canvas);
    return /** @type {any} */ ({
        canvas,
        gl: {},
        _pickingBufferInfo: {},
        getDevicePixelRatio: () => 1,
    });
}
