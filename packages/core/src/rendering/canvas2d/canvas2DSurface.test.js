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
    expect(backend.glHelper).toBeUndefined();
    expect(container.querySelectorAll("canvas")).toHaveLength(1);

    backend.surface.finalize();
    expect(container.querySelector("canvas")).toBeNull();
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
