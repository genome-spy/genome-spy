// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";

import { createEmbed } from "./embedFactory.js";

describe("embed factory", () => {
    class MockGenomeSpy {
        /**
         * @param {HTMLElement} element
         * @param {any} spec
         */
        constructor(element, spec) {
            this.element = element;
            this.spec = spec;
            this.launch = vi.fn();
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
        }
    }

    test("forwards getParam from the GenomeSpy instance", async () => {
        const paramApi = {
            /** @returns {number} */
            getValue: () => 1,
            /** @param {number} value */
            setValue: (value) => {
                void value;
            },
            /** @param {(value: number) => void} listener */
            subscribe: (listener) => {
                void listener;
                return function unsubscribe() {};
            },
        };

        class ParamGenomeSpy extends MockGenomeSpy {
            /**
             * @param {HTMLElement} element
             * @param {any} spec
             */
            constructor(element, spec) {
                super(element, spec);
                this.getParam = vi.fn(() => paramApi);
            }
        }

        const embed = createEmbed(/** @type {any} */ (ParamGenomeSpy));
        const element = document.createElement("div");
        const api = await embed(element, /** @type {any} */ ({}));

        expect(api.getParam("threshold")).toBe(paramApi);
    });

    test("forwards SVG export from the GenomeSpy instance", async () => {
        const svgBlob = new Blob([], { type: "image/svg+xml" });
        const svgResult = {
            blob: svgBlob,
            warnings: /** @type {string[]} */ ([]),
        };

        class SvgGenomeSpy extends MockGenomeSpy {
            /**
             * @param {HTMLElement} element
             * @param {any} spec
             */
            constructor(element, spec) {
                super(element, spec);
                this.exportSvg = vi.fn(async () => svgResult);
            }
        }

        const embed = createEmbed(/** @type {any} */ (SvgGenomeSpy));
        const api = await embed(
            document.createElement("div"),
            /** @type {any} */ ({})
        );

        await expect(api.imageExport.svg()).resolves.toBe(svgResult);
    });

    test("forwards raster export from the GenomeSpy instance", async () => {
        const rasterResult = {
            blob: new Blob([], { type: "image/png" }),
        };

        class RasterGenomeSpy extends MockGenomeSpy {
            /**
             * @param {HTMLElement} element
             * @param {any} spec
             */
            constructor(element, spec) {
                super(element, spec);
                this.exportRaster = vi.fn(async () => rasterResult);
            }
        }

        const embed = createEmbed(/** @type {any} */ (RasterGenomeSpy));
        const api = await embed(
            document.createElement("div"),
            /** @type {any} */ ({})
        );

        await expect(api.imageExport.raster()).resolves.toBe(rasterResult);
    });

    test("forwards SVG export analysis from the GenomeSpy instance", async () => {
        /** @type {import("./types/embedApi.js").SvgExportAnalysis} */
        const analysis = { layers: [] };

        class SvgGenomeSpy extends MockGenomeSpy {
            /**
             * @param {HTMLElement} element
             * @param {any} spec
             */
            constructor(element, spec) {
                super(element, spec);
                this.analyzeSvgExport = vi.fn(async () => analysis);
            }
        }

        const embed = createEmbed(/** @type {any} */ (SvgGenomeSpy));
        const api = await embed(
            document.createElement("div"),
            /** @type {any} */ ({})
        );

        await expect(api.imageExport.analyzeSvg()).resolves.toBe(analysis);
    });

    test("exposes the view mutation API", async () => {
        /** @type {any} */
        const viewRoot = {
            explicitName: "root",
            name: "root",
            layoutParent: undefined,
            getDescendants: () => [viewRoot],
            children: [],
        };

        class ViewGenomeSpy extends MockGenomeSpy {
            /**
             * @param {HTMLElement} element
             * @param {any} spec
             */
            constructor(element, spec) {
                super(element, spec);
                this.viewRoot = viewRoot;
            }
        }

        const embed = createEmbed(/** @type {any} */ (ViewGenomeSpy));
        const element = document.createElement("div");
        const api = await embed(element, /** @type {any} */ ({}));

        expect(api.views.root().name).toBe("root");
        expect(api.datasets).toMatchObject({
            set: expect.any(Function),
            load: expect.any(Function),
            reset: expect.any(Function),
        });
    });

    test("invalidates dataset operations when finalized", async () => {
        /** @type {any} */
        const viewRoot = {
            explicitName: "root",
            name: "root",
            layoutParent: undefined,
            getDescendants: () => [viewRoot],
            children: [],
        };

        class ViewGenomeSpy extends MockGenomeSpy {
            /**
             * @param {HTMLElement} element
             * @param {any} spec
             */
            constructor(element, spec) {
                super(element, spec);
                this.viewRoot = viewRoot;
            }
        }

        const embed = createEmbed(/** @type {any} */ (ViewGenomeSpy));
        const element = document.createElement("div");
        const api = await embed(element, /** @type {any} */ ({}));

        api.finalize();

        await expect(
            api.datasets.load("values", new ArrayBuffer(0), {
                type: "arrow",
            })
        ).rejects.toMatchObject({ code: "staleEmbed" });
    });

    test("exposes debug hooks for developer tooling", async () => {
        /** @type {any} */
        const viewRoot = {
            explicitName: "root",
            name: "root",
            layoutParent: undefined,
            getDescendants: () => [viewRoot],
            children: [],
        };

        class ViewGenomeSpy extends MockGenomeSpy {
            /**
             * @param {HTMLElement} element
             * @param {any} spec
             */
            constructor(element, spec) {
                super(element, spec);
                this.viewRoot = viewRoot;
            }
        }

        const embed = createEmbed(/** @type {any} */ (ViewGenomeSpy));
        const element = document.createElement("div");
        const api = await embed(element, /** @type {any} */ ({}));

        expect(api.debug.getViewRoot()).toBe(viewRoot);
        await expect(api.debug.getModules()).resolves.toHaveProperty(
            "createViewDebugSnapshot"
        );
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
