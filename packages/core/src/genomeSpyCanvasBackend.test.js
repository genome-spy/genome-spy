// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createRenderingBackend: vi.fn(),
}));

vi.mock("./rendering/renderingBackend.js", () => ({
    createRenderingBackend: mocks.createRenderingBackend,
}));

vi.mock("./styles/genome-spy.css.js", () => ({ default: "" }));

import GenomeSpy from "./genomeSpyBase.js";

beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({
            addEventListener: /** @returns {void} */ () => undefined,
            removeEventListener: /** @returns {void} */ () => undefined,
        }))
    );
    window.requestAnimationFrame = vi.fn(() => 1);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

test("launches with a rendering backend that has no WebGL helper", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const canvas = document.createElement("canvas");
    const finalize = vi.fn();

    mocks.createRenderingBackend.mockImplementation((options) => {
        options.container.appendChild(canvas);
        return {
            surface: {
                canvas,
                invalidateSize: () => false,
                getLogicalCanvasSize: () => ({ width: 100, height: 100 }),
                getDevicePixelRatio: () => 1,
                finalize,
            },
            glHelper: undefined,
            createRenderCoordinator: () => ({
                computeLayout: /** @returns {void} */ () => undefined,
                renderAll: /** @returns {void} */ () => undefined,
            }),
        };
    });

    const genomeSpy = new GenomeSpy(
        container,
        {
            width: 100,
            height: 100,
            data: { values: [{}] },
            mark: "rect",
            encoding: {
                x: { value: 0 },
                x2: { value: 1 },
                y: { value: 0 },
                y2: { value: 1 },
            },
        },
        { renderer: "canvas" }
    );

    expect(await genomeSpy.launch()).toBe(true);
    expect(genomeSpy.viewRoot.context.glHelper).toBeUndefined();
    expect(mocks.createRenderingBackend).toHaveBeenCalledWith(
        expect.objectContaining({ renderer: "canvas" })
    );

    genomeSpy.destroy();
    expect(finalize).toHaveBeenCalledOnce();
});

test("reports a backend error once and fails an in-progress launch", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const runtimeError = new Error("device lost");
    const onError = vi.fn(() => true);
    const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

    mocks.createRenderingBackend.mockImplementation((options) => {
        const backend = createMockBackend(options);
        options.onError(runtimeError);
        return backend;
    });
    const genomeSpy = new GenomeSpy(
        container,
        {
            width: 100,
            height: 100,
            data: { values: [{}] },
            mark: "rect",
        },
        { renderer: "canvas", onError }
    );

    expect(await genomeSpy.launch()).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(runtimeError, container);
    expect(container.querySelectorAll(".message-box")).toHaveLength(0);
    expect(consoleError).toHaveBeenCalledOnce();

    genomeSpy.destroy();
});

test("shows a post-launch backend error and ignores notifications after destroy", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    /** @type {import("./rendering/renderingBackend.js").RenderingBackendOptions | undefined} */
    let backendOptions;
    const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

    mocks.createRenderingBackend.mockImplementation((options) => {
        backendOptions = options;
        return createMockBackend(options);
    });
    const genomeSpy = new GenomeSpy(
        container,
        {
            width: 100,
            height: 100,
            data: { values: [{}] },
            mark: "rect",
        },
        { renderer: "canvas" }
    );
    expect(await genomeSpy.launch()).toBe(true);
    const runtimeError = new Error("device lost");

    backendOptions.onError(runtimeError);
    backendOptions.onError(runtimeError);

    expect(container.querySelectorAll(".message-box")).toHaveLength(1);
    expect(consoleError).toHaveBeenCalledOnce();

    genomeSpy.destroy();
    backendOptions.onError(new Error("late loss"));
    expect(container.childElementCount).toBe(0);
    expect(consoleError).toHaveBeenCalledOnce();
});

/**
 * @param {import("./rendering/renderingBackend.js").RenderingBackendOptions} options
 * @returns {import("./rendering/renderingBackend.js").RenderingBackend}
 */
function createMockBackend(options) {
    const canvas = document.createElement("canvas");
    options.container.appendChild(canvas);
    return {
        surface: {
            canvas,
            invalidateSize: () => false,
            getLogicalCanvasSize: () => ({ width: 100, height: 100 }),
            getDevicePixelRatio: () => 1,
            finalize: vi.fn(),
        },
        glHelper: undefined,
        createRenderCoordinator: () => ({
            computeLayout: /** @returns {void} */ () => undefined,
            renderAll: /** @returns {void} */ () => undefined,
        }),
        exportCanvas: vi.fn(),
        exportRaster: vi.fn(),
    };
}
