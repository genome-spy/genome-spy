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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

test("launches with a rendering backend that has no retained resources", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const canvas = document.createElement("canvas");
    const finalize = vi.fn();

    mocks.createRenderingBackend.mockImplementation((options) => {
        options.container.appendChild(canvas);
        /** @type {import("./fonts/textMetrics.js").TextMetricsProvider} */
        const textMetrics = {
            requestFont: () => ({
                measureWidth: () => 0,
                getHeight: () => 0,
            }),
            waitUntilReady: async () => undefined,
        };
        return {
            surface: {
                canvas,
                invalidateSize: () => false,
                getLogicalCanvasSize: () => ({ width: 100, height: 100 }),
                getDevicePixelRatio: () => 1,
                finalize,
            },
            textMetrics,
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
    expect(mocks.createRenderingBackend).toHaveBeenCalledWith(
        expect.objectContaining({ renderer: "canvas" })
    );

    genomeSpy.destroy();
    expect(finalize).toHaveBeenCalledOnce();
});

test("forwards a font catalog to the selected rendering backend", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const fontCatalog = [
        { family: "Study Sans", source: "https://example.test/study.ttf" },
    ];
    mocks.createRenderingBackend.mockImplementation(createMockBackend);
    const genomeSpy = new GenomeSpy(
        container,
        {
            width: 100,
            height: 100,
            data: { values: [{}] },
            mark: "rect",
        },
        { renderer: "webgpu", fontCatalog }
    );

    expect(await genomeSpy.launch()).toBe(true);
    expect(mocks.createRenderingBackend).toHaveBeenCalledWith(
        expect.objectContaining({ renderer: "webgpu", fontCatalog })
    );

    genomeSpy.destroy();
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

test("reports an early resize error once and fails launch", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const runtimeError = new Error("Invalid color range");
    const onError = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});

    /** @type {() => void} */
    let resize;
    vi.stubGlobal(
        "ResizeObserver",
        class {
            /** @param {() => void} callback */
            constructor(callback) {
                resize = callback;
            }
            observe() {}
            disconnect() {}
        }
    );

    // Keep startup pending so the initial resize runs before launch's final layout.
    /** @type {() => void} */
    let finishFonts;
    const fontsReady = new Promise((resolve) => {
        finishFonts = () => resolve(undefined);
    });
    const waitUntilReady = vi.fn(() => fontsReady);
    mocks.createRenderingBackend.mockImplementation((options) => {
        const backend = createMockBackend(options);
        backend.textMetrics.waitUntilReady = waitUntilReady;
        backend.createRenderCoordinator = () => ({
            // Failed WebGL marks are skipped by subsequent layout passes.
            computeLayout: vi.fn().mockImplementationOnce(() => {
                throw runtimeError;
            }),
            renderAll: vi.fn(),
        });
        return backend;
    });
    const genomeSpy = new GenomeSpy(
        container,
        { data: { values: [{}] }, mark: "rect" },
        { renderer: "canvas", onError }
    );

    const launch = genomeSpy.launch();
    await vi.waitFor(() => expect(waitUntilReady).toHaveBeenCalled());
    expect(() => resize()).not.toThrow();
    expect(container.querySelector(".message-box").textContent).toContain(
        runtimeError.message
    );

    finishFonts();
    expect(await launch).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(runtimeError, container);

    genomeSpy.destroy();
});

test.each(/** @type {const} */ (["computeLayout", "renderAll"]))(
    "reports scheduled %s errors while preserving synchronous throws",
    async (operation) => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const runtimeError = new Error("Scheduled rendering failed");
        const onError = vi.fn();
        vi.spyOn(console, "error").mockImplementation(() => {});
        const coordinator = { computeLayout: vi.fn(), renderAll: vi.fn() };
        mocks.createRenderingBackend.mockImplementation((options) => ({
            ...createMockBackend(options),
            createRenderCoordinator: () => coordinator,
        }));
        const genomeSpy = new GenomeSpy(
            container,
            { width: 100, height: 100, data: { values: [{}] }, mark: "rect" },
            { renderer: "canvas", onError }
        );
        expect(await genomeSpy.launch()).toBe(true);

        coordinator[operation].mockImplementation(() => {
            throw runtimeError;
        });
        expect(() => genomeSpy[operation]()).toThrow(runtimeError);
        expect(onError).not.toHaveBeenCalled();

        genomeSpy.requestLayoutReflow();
        const frame = vi.mocked(window.requestAnimationFrame).mock.calls[0][0];
        expect(() => frame(1)).not.toThrow();
        expect(onError).toHaveBeenCalledOnce();
        expect(onError).toHaveBeenCalledWith(runtimeError, container);
        expect(container.querySelector(".message-box").textContent).toContain(
            runtimeError.message
        );

        genomeSpy.destroy();
    }
);

test("disposes a backend that finishes loading after destroy", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    /** @type {(backend: import("./rendering/renderingBackend.js").RenderingBackend) => void} */
    let resolveBackend;
    /** @type {import("./rendering/renderingBackend.js").RenderingBackendOptions} */
    let backendOptions;
    mocks.createRenderingBackend.mockImplementation((options) => {
        backendOptions = options;
        return new Promise((resolve) => {
            resolveBackend = resolve;
        });
    });
    const genomeSpy = new GenomeSpy(
        container,
        {
            width: 100,
            height: 100,
            data: { values: [{}] },
            mark: "rect",
        },
        { renderer: "webgl" }
    );

    const launch = genomeSpy.launch();
    await vi.waitFor(() =>
        expect(container.querySelector(".canvas-wrapper")).not.toBeNull()
    );
    genomeSpy.destroy();

    const backend = createMockBackend(backendOptions);
    resolveBackend(backend);

    expect(await launch).toBe(false);
    expect(backend.surface.finalize).toHaveBeenCalledOnce();
    expect(container.childElementCount).toBe(0);
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
        textMetrics: {
            requestFont: () => ({
                measureWidth: () => 0,
                getHeight: () => 0,
            }),
            waitUntilReady: async () => undefined,
        },
        createRenderCoordinator: () => ({
            computeLayout: /** @returns {void} */ () => undefined,
            renderAll: /** @returns {void} */ () => undefined,
        }),
        exportCanvas: vi.fn(),
        exportRaster: vi.fn(),
    };
}
