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
