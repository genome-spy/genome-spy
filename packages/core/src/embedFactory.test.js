// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";

import { createEmbed } from "./embedFactory.js";

describe("embed factory", () => {
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

        class MockGenomeSpy {
            constructor() {
                this.launch = vi.fn();
                this.getParam = vi.fn(() => paramApi);
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

        const embed = createEmbed(/** @type {any} */ (MockGenomeSpy));
        const element = document.createElement("div");
        const api = await embed(element, /** @type {any} */ ({}));

        expect(api.getParam("threshold")).toBe(paramApi);
    });
});
