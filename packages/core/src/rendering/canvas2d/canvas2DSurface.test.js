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

test("creates a detached logical-pixel picking visualization", () => {
    /** @type {HTMLCanvasElement[]} */
    const canvases = [];
    const liveContext = /** @type {any} */ ({});
    /** @type {ImageData[]} */
    const imageDatas = [];
    const diagnosticContext = /** @type {any} */ ({
        createImageData: vi.fn((width, height) => {
            const imageData = /** @type {ImageData} */ ({
                data: new Uint8ClampedArray(width * height * 4),
            });
            imageDatas.push(imageData);
            return imageData;
        }),
        putImageData: vi.fn(),
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
        function () {
            canvases.push(this);
            return canvases.length == 1 ? liveContext : diagnosticContext;
        }
    );
    const backend = createCanvas2DRenderingBackend({
        renderer: "canvas",
        container: document.createElement("div"),
        sizeSource: () => ({ width: 4.5, height: 2.5 }),
        powerPreference: "default",
        onCanvasResize: () => undefined,
    });
    const surface = /** @type {import("./canvas2DSurface.js").default} */ (
        backend.surface
    );
    const buffer = surface.getPickingBuffer();
    buffer.ids[1] = 123;

    const visualization = surface.createPickingBufferVisualization();
    const secondVisualization = surface.createPickingBufferVisualization();

    expect(visualization).toMatchObject({ width: 4, height: 2 });
    expect(secondVisualization).not.toBe(visualization);
    expect(diagnosticContext.createImageData).toHaveBeenCalledWith(4, 2);
    expect(Array.from(imageDatas[0].data.slice(0, 4))).toEqual([0, 0, 0, 255]);
    expect(Array.from(imageDatas[0].data.slice(4, 8))).not.toEqual([
        0, 0, 0, 255,
    ]);
    expect(imageDatas[1].data).toEqual(imageDatas[0].data);
    expect(diagnosticContext.putImageData).toHaveBeenCalledTimes(2);
    expect(canvases).toHaveLength(3);

    surface.finalize();
    expect(visualization).toMatchObject({ width: 4, height: 2 });
    expect(surface.createPickingBufferVisualization()).toBeUndefined();
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
