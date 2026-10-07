// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";

import { createEmbed } from "./embedFactory.js";
import ViewError from "./view/viewError.js";

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("embed factory", () => {
    class MockGenomeSpy {
        /**
         * @param {HTMLElement} element
         * @param {any} spec
         */
        constructor(element, spec) {
            this.element = element;
            this.spec = spec;
            this.launch = vi.fn(async () => true);
            this.getParam = vi.fn();
            this.destroy = vi.fn();
            this.addEventListener = vi.fn();
            this.removeEventListener = vi.fn();
            this.getNamedScaleResolutions = vi.fn(() => new Map());
            this.awaitVisibleLazyData = vi.fn();
            this.getRenderedBounds = vi.fn();
            this.updateNamedData = vi.fn();
            this.getLogicalCanvasSize = vi.fn();
            this.exportCanvas = vi.fn();
            this.exportRaster = vi.fn();
            this.exportSvg = vi.fn();
            this.analyzeSvgExport = vi.fn();
            this.createPickingBufferVisualization = vi.fn(() =>
                document.createElement("canvas")
            );
        }
    }

    /**
     * @param {Record<string, unknown>} [overrides]
     * @param {import("./types/embedApi.js").EmbedOptions} [options]
     */
    async function embedMock(overrides = {}, options = {}) {
        class ConfiguredGenomeSpy extends MockGenomeSpy {
            /**
             * @param {HTMLElement} element
             * @param {any} spec
             */
            constructor(element, spec) {
                super(element, spec);
                Object.assign(this, overrides);
            }
        }

        const embed = createEmbed(/** @type {any} */ (ConfiguredGenomeSpy));
        return embed(
            document.createElement("div"),
            /** @type {any} */ ({}),
            options
        );
    }

    /** @returns {any} */
    function makeViewRoot() {
        /** @type {any} */
        const viewRoot = {
            explicitName: "root",
            name: "root",
            layoutParent: undefined,
            getDescendants: () => [viewRoot],
            children: [],
        };
        return viewRoot;
    }

    test("rejects with the original constructor error and displays it", async () => {
        const error = new ViewError(
            "Invalid configuration",
            /** @type {any} */ ({ getPathString: () => "root/plot" })
        );
        const constructor = vi.fn(function () {
            throw error;
        });
        const embed = createEmbed(/** @type {any} */ (constructor));
        const element = document.createElement("div");
        const onError = vi.fn();
        vi.spyOn(console, "error").mockImplementation(() => {});

        await expect(
            embed(element, /** @type {any} */ ({}), { onError })
        ).rejects.toBe(error);
        expect(element.querySelector(".message-box > div").textContent).toBe(
            `At "root/plot": ${error}`
        );
        expect(element.querySelector("style").textContent).toContain(
            ".message-box"
        );
        expect(onError).toHaveBeenCalledOnce();
        expect(onError).toHaveBeenCalledWith(error, element);
    });

    test("preserves spec-loading diagnostics before construction", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: false,
                status: 404,
                statusText: "Not Found",
            }))
        );
        vi.spyOn(console, "error").mockImplementation(() => {});
        const constructor = vi.fn();
        const embed = createEmbed(/** @type {any} */ (constructor));
        const element = document.createElement("div");

        await expect(embed(element, "missing.json")).rejects.toMatchObject({
            message: expect.stringContaining(
                "Could not load or parse configuration"
            ),
            cause: { kind: "http", message: "404 Not Found" },
        });
        expect(element.querySelector(".message-box").textContent).toContain(
            "404 Not Found"
        );
        expect(constructor).not.toHaveBeenCalled();
    });

    test("preserves the setup error if cleanup and error reporting also fail", async () => {
        const error = new Error("Initialization failed");
        const cleanupError = new Error("Cleanup failed");
        const reportingError = new Error("Error callback failed");
        const destroy = vi.fn(() => {
            throw cleanupError;
        });
        const consoleError = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});

        await expect(
            embedMock(
                {
                    launch: vi.fn(async () => {
                        throw error;
                    }),
                    destroy,
                },
                {
                    onError: () => {
                        throw reportingError;
                    },
                }
            )
        ).rejects.toBe(error);
        expect(destroy).toHaveBeenCalledOnce();
        expect(consoleError).toHaveBeenCalledWith(cleanupError);
        expect(consoleError).toHaveBeenCalledWith(reportingError);
    });

    test("forwards getParam from the GenomeSpy instance", async () => {
        const paramApi = { getValue: () => 1 };
        const api = await embedMock({ getParam: vi.fn(() => paramApi) });

        expect(api.getParam("threshold")).toBe(paramApi);
    });

    test("forwards SVG export from the GenomeSpy instance", async () => {
        const svgBlob = new Blob([], { type: "image/svg+xml" });
        const svgResult = {
            blob: svgBlob,
            warnings: /** @type {string[]} */ ([]),
        };

        const api = await embedMock({
            exportSvg: vi.fn(async () => svgResult),
        });

        await expect(api.imageExport.svg()).resolves.toBe(svgResult);
    });

    test("forwards raster export from the GenomeSpy instance", async () => {
        const rasterResult = {
            blob: new Blob([], { type: "image/png" }),
        };

        const api = await embedMock({
            exportRaster: vi.fn(async () => rasterResult),
        });

        await expect(api.imageExport.raster()).resolves.toBe(rasterResult);
    });

    test("forwards SVG export analysis from the GenomeSpy instance", async () => {
        /** @type {import("./types/embedApi.js").SvgExportAnalysis} */
        const analysis = { layers: [] };

        const api = await embedMock({
            analyzeSvgExport: vi.fn(async () => analysis),
        });

        await expect(api.imageExport.analyzeSvg()).resolves.toBe(analysis);
    });

    test("exposes the view mutation API", async () => {
        const viewRoot = makeViewRoot();
        const api = await embedMock({ viewRoot });

        expect(api.views.root().name).toBe("root");
        expect(api.datasets).toMatchObject({
            set: expect.any(Function),
            load: expect.any(Function),
            reset: expect.any(Function),
        });
    });

    test("invalidates dataset operations when finalized", async () => {
        const api = await embedMock({ viewRoot: makeViewRoot() });

        api.finalize();

        await expect(
            api.datasets.load("values", new ArrayBuffer(0), {
                type: "arrow",
            })
        ).rejects.toMatchObject({ code: "staleEmbed" });
    });

    test("exposes debug hooks for developer tooling", async () => {
        const viewRoot = makeViewRoot();
        const api = await embedMock({ viewRoot });

        expect(api.debug.getViewRoot()).toBe(viewRoot);
        await expect(api.debug.getModules()).resolves.toHaveProperty(
            "createViewDebugSnapshot"
        );
        expect(api.debug.createPickingBufferVisualization?.()).toBeInstanceOf(
            HTMLCanvasElement
        );
        api.finalize();
        expect(api.debug.createPickingBufferVisualization?.()).toBeUndefined();
    });

    test("reports an unsupported picking-buffer visualization", async () => {
        const api = await embedMock({
            createPickingBufferVisualization: vi.fn(() => undefined),
        });

        expect(api.debug.createPickingBufferVisualization?.()).toBeUndefined();
    });

    test("leaves missing width implicit", async () => {
        /** @type {MockGenomeSpy | undefined} */
        let instance;
        class CapturingGenomeSpy extends MockGenomeSpy {
            /**
             * @param {HTMLElement} element
             * @param {any} spec
             */
            constructor(element, spec) {
                super(element, spec);
                instance = this;
            }
        }

        const embed = createEmbed(/** @type {any} */ (CapturingGenomeSpy));
        const element = document.createElement("div");
        await embed(element, /** @type {any} */ ({}));

        expect(instance.spec).toEqual({
            baseUrl: "",
            padding: 10,
        });
    });
});
