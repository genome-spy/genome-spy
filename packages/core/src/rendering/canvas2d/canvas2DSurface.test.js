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
