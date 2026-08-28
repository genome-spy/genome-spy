// @vitest-environment jsdom

import { afterEach, expect, test, vi } from "vitest";
import { createCanvas2DRenderingBackend } from "./index.js";

afterEach(() => {
    vi.restoreAllMocks();
});

test("creates only a 2D context and sizes its backing store", () => {
    /** @type {string[]} */
    const contextTypes = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
        function (type) {
            contextTypes.push(type);
            return /** @type {any} */ ({ canvas: this });
        }
    );
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
    const container = document.createElement("div");

    const backend = createCanvas2DRenderingBackend({
        renderer: "canvas",
        container,
        sizeSource: () => ({ width: 100, height: 50 }),
        powerPreference: "default",
        onCanvasResize: () => undefined,
    });

    expect(contextTypes).toEqual(["2d"]);
    expect(backend.surface.canvas.width).toBe(200);
    expect(backend.surface.canvas.height).toBe(100);
    expect("rendererResources" in backend).toBe(false);
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    expect(backend.readPickingId?.(10, 10)).toBe(0);

    const surface = /** @type {import("./canvas2DSurface.js").default} */ (
        backend.surface
    );
    const pickingBuffer = surface.getPickingBuffer();
    pickingBuffer.ids[10 * pickingBuffer.width + 10] = 42;
    expect(backend.readPickingId?.(10.9, 10.9)).toBe(42);

    backend.surface.finalize();
    expect(container.querySelector("canvas")).toBeNull();
    expect(backend.readPickingId?.(10, 10)).toBe(0);
});

test("resizes an allocated picking buffer in logical pixels", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
        function () {
            return /** @type {any} */ ({ canvas: this });
        }
    );
    let size = { width: 20.75, height: 10.5 };
    const backend = createCanvas2DRenderingBackend({
        renderer: "canvas",
        container: document.createElement("div"),
        sizeSource: () => size,
        powerPreference: "default",
        onCanvasResize: () => undefined,
    });
    const surface = /** @type {import("./canvas2DSurface.js").default} */ (
        backend.surface
    );

    expect(surface.getPickingBuffer()).toMatchObject({ width: 20, height: 10 });
    size = { width: 31.25, height: 12.75 };
    surface.invalidateSize();
    expect(surface.getPickingBuffer()).toMatchObject({ width: 31, height: 12 });
    expect(backend.readPickingId?.(31, 5)).toBe(0);

    surface.finalize();
});

test("colorizes and blits logical picking pixels with nearest-neighbor scaling", () => {
    /** @type {HTMLCanvasElement[]} */
    const canvases = [];
    const liveContext = /** @type {any} */ ({
        resetTransform: vi.fn(),
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        imageSmoothingEnabled: true,
        globalAlpha: 0,
        globalCompositeOperation: "multiply",
    });
    const imageData = { data: new Uint8ClampedArray(4 * 2 * 4) };
    const diagnosticContext = /** @type {any} */ ({
        createImageData: vi.fn(() => imageData),
        putImageData: vi.fn(),
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
        function () {
            canvases.push(this);
            return canvases.length == 1 ? liveContext : diagnosticContext;
        }
    );
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
    const onRenderInvalidated = vi.fn();
    const backend = createCanvas2DRenderingBackend({
        renderer: "canvas",
        container: document.createElement("div"),
        sizeSource: () => ({ width: 4.5, height: 2.5 }),
        powerPreference: "default",
        onCanvasResize: () => undefined,
        onRenderInvalidated,
    });
    const surface = /** @type {import("./canvas2DSurface.js").default} */ (
        backend.surface
    );
    const buffer = surface.getPickingBuffer();
    buffer.ids[1] = 123;

    expect(backend.setPickingBufferVisualization?.(true)).toBe(true);
    surface.blitPickingBufferVisualization();

    expect(onRenderInvalidated).toHaveBeenCalledOnce();
    expect(diagnosticContext.createImageData).toHaveBeenCalledWith(4, 2);
    expect(Array.from(imageData.data.slice(4, 8))).not.toEqual([0, 0, 0, 255]);
    expect(diagnosticContext.putImageData).toHaveBeenCalledWith(
        imageData,
        0,
        0
    );
    expect(liveContext.drawImage).toHaveBeenCalledWith(
        canvases[1],
        0,
        0,
        4,
        2,
        0,
        0,
        8,
        4
    );
    expect(liveContext.imageSmoothingEnabled).toBe(true);

    surface.finalize();
    expect(canvases[1]).toMatchObject({ width: 0, height: 0 });
    expect(backend.setPickingBufferVisualization?.(false)).toBe(false);
    expect(onRenderInvalidated).toHaveBeenCalledOnce();
});

test("does not attach a canvas when a 2D context is unavailable", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const container = document.createElement("div");

    expect(() =>
        createCanvas2DRenderingBackend({
            renderer: "canvas",
            container,
            sizeSource: () => ({ width: 100, height: 50 }),
            powerPreference: "default",
            onCanvasResize: () => undefined,
        })
    ).toThrow("Unable to initialize a Canvas2D rendering context");
    expect(container.querySelector("canvas")).toBeNull();
});
