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
import { createEmbed } from "./embedFactory.js";

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

test.each([false, true])(
    "rejects and cleans up a failed embed with custom error UI: %s",
    async (handled) => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const error = new Error("Layout initialization failed");
        const finalize = vi.fn();
        vi.spyOn(console, "error").mockImplementation(() => {});
        mocks.createRenderingBackend.mockImplementationOnce((options) => {
            const backend = createMockBackend(options);
            backend.surface.finalize = finalize;
            backend.createRenderCoordinator = () => ({
                computeLayout: () => {
                    throw error;
                },
                renderAll: () => {},
            });
            return backend;
        });
        const onError = vi.fn((reportedError, element) => {
            // The host can render safely after failed setup resources are released.
            expect(finalize).toHaveBeenCalledOnce();
            expect(reportedError).toBe(error);
            if (handled) element.textContent = "Host error display";
            return handled;
        });
        const embed = createEmbed(GenomeSpy);
        const spec = {
            width: 100,
            height: 100,
            data: { values: [{}] },
            mark: /** @type {const} */ ("rect"),
        };

        await expect(
            embed(container, spec, { renderer: "canvas", onError })
        ).rejects.toBe(error);
        expect(onError).toHaveBeenCalledOnce();
        if (handled) {
            expect(container.textContent).toBe("Host error display");
            expect(container.querySelector("style")).toBeNull();
        } else {
            expect(
                container.querySelector(".message-box > div").textContent
            ).toBe(String(error));
            expect(container.querySelectorAll("style")).toHaveLength(1);
        }
        expect(container.querySelector("canvas")).toBeNull();

        mocks.createRenderingBackend.mockImplementation(createMockBackend);
        const api = await embed(container, spec, { renderer: "canvas" });
        expect(api.views.root().isAlive()).toBe(true);
        expect(container.textContent).not.toContain(error.message);
        expect(container.querySelectorAll("style")).toHaveLength(1);
        api.finalize();
    }
);

test.each([false, true])(
    "reports an embedded runtime error with custom error UI: %s",
    async (handled) => {
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
        const onError = vi.fn(() => handled);
        const api = await createEmbed(GenomeSpy)(
            container,
            {
                width: 100,
                height: 100,
                data: { values: [{}] },
                mark: "rect",
            },
            { renderer: "canvas", onError }
        );
        const runtimeError = new Error("device lost");

        backendOptions.onError(runtimeError);
        backendOptions.onError(runtimeError);

        expect(container.querySelectorAll(".message-box")).toHaveLength(
            handled ? 0 : 1
        );
        expect(onError).toHaveBeenCalledOnce();
        expect(onError).toHaveBeenCalledWith(runtimeError, container);
        expect(consoleError).toHaveBeenCalledOnce();

        api.finalize();
        backendOptions.onError(new Error("late loss"));
        expect(container.childElementCount).toBe(0);
        expect(consoleError).toHaveBeenCalledOnce();
        expect(onError).toHaveBeenCalledOnce();
    }
);

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

test.each([
    { path: "flush", handled: false },
    { path: "flush", handled: true },
    { path: "flush", handled: "throw" },
    { path: "transform debounce", handled: false },
    { path: "parameter debounce", handled: false },
    { path: "notification", handled: false },
])(
    "reports reactive $path errors (host handling: $handled)",
    async ({ path, handled }) => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        mocks.createRenderingBackend.mockImplementation(createMockBackend);
        vi.spyOn(console, "error").mockImplementation(() => {});
        const onError = vi.fn(() => {
            if (handled === "throw")
                throw new Error("Host error handler failed");
            return handled === true;
        });
        const embed = createEmbed(GenomeSpy);
        const api = await embed(
            container,
            {
                width: 100,
                height: 100,
                params: [
                    { name: "target", value: { value: 1 } },
                    ...(path === "parameter debounce" || path === "notification"
                        ? [
                              {
                                  name: "factor",
                                  expr:
                                      path === "notification"
                                          ? "target.value"
                                          : "target",
                                  debounce: 50,
                              },
                          ]
                        : []),
                ],
                data: { values: [{ x: 1 }] },
                transform: [
                    {
                        type: "formula",
                        expr:
                            path === "notification"
                                ? "datum.x * factor"
                                : path === "parameter debounce"
                                  ? "datum.x * factor.value"
                                  : "datum.x * target.value",
                        as: "y",
                        ...(path === "transform debounce"
                            ? { debounce: 50 }
                            : {}),
                    },
                ],
                mark: "rect",
            },
            { renderer: "canvas", onError }
        );

        // Fake only publication timers, leaving microtask propagation unchanged.
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        try {
            /** @type {unknown} */
            let originalError;
            try {
                api.params.get("target").setValue(null);
                vi.advanceTimersByTime(50);
            } catch (error) {
                originalError = error;
            }
            expect(originalError).toBeInstanceOf(Error);
            expect(onError).toHaveBeenCalledExactlyOnceWith(
                originalError,
                container
            );
            expect(container.querySelectorAll(".message-box")).toHaveLength(
                handled === true ? 0 : 1
            );
            if (handled !== true) {
                expect(
                    container.querySelector(".message-box").textContent
                ).toContain(String(originalError));
            }
        } finally {
            api.finalize();
            vi.useRealTimers();
        }
    }
);

test("a reactive error during launch remains a launch failure", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const onError = vi.fn(() => true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fontsReady = Promise.withResolvers();
    const waitUntilReady = vi.fn(() => fontsReady.promise);
    mocks.createRenderingBackend.mockImplementation((options) => {
        const backend = createMockBackend(options);
        backend.textMetrics.waitUntilReady = waitUntilReady;
        return backend;
    });
    const genomeSpy = new GenomeSpy(
        container,
        {
            width: 100,
            height: 100,
            params: [
                { name: "target", value: { value: 1 } },
                { name: "derived", expr: "target.value", debounce: 50 },
            ],
            data: { values: [{ x: 1 }] },
            mark: "rect",
            transform: [
                { type: "formula", expr: "datum.x * derived", as: "y" },
            ],
        },
        { renderer: "canvas", onError }
    );

    const launch = genomeSpy.launch();
    await vi.waitFor(() => {
        expect(onError.mock.calls).toEqual([]);
        expect(waitUntilReady).toHaveBeenCalled();
    });
    expect(() => genomeSpy.getParam("target").setValue(null)).toThrow(
        "target.value"
    );
    fontsReady.resolve();
    expect(await launch).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
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
