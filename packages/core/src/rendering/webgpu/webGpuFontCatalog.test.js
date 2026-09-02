import { describe, expect, test, vi } from "vitest";

const loaders = vi.hoisted(() => ({
    loadDefaultFont: vi.fn(async () => ({ name: "Default Font" })),
    loadTrueTypeFont: vi.fn(async (url) => ({ url })),
}));

vi.mock("@genome-spy/webgpu-renderer/fonts/default", () => ({
    loadDefaultFont: loaders.loadDefaultFont,
}));

vi.mock("@genome-spy/webgpu-renderer/fonts/truetype", () => ({
    loadTrueTypeFont: loaders.loadTrueTypeFont,
}));

import {
    prepareOutlineFont,
    resolveExampleFontUrl,
} from "./webGpuFontCatalog.js";

describe("WebGPU example font catalog", () => {
    test("uses Default Font only for the implicit regular face", async () => {
        await prepareOutlineFont({
            family: undefined,
            style: "normal",
            weight: 400,
            implicitFamily: true,
        });

        expect(loaders.loadDefaultFont).toHaveBeenCalledOnce();
        expect(loaders.loadTrueTypeFont).not.toHaveBeenCalled();
    });

    test("resolves non-default implicit variants to exact Lato faces", () => {
        expect(
            resolveExampleFontUrl({
                family: undefined,
                style: "normal",
                weight: 600,
                implicitFamily: true,
            })
        ).toContain("Lato-SemiBold.ttf");
    });

    test.each([
        ["Indie Flower", 400],
        ["Lato", 400],
        ["Lato", 900],
        ["Lobster", 400],
        ["Oswald", 400],
        ["Oswald", 700],
        ["Radley", 400],
        ["Roboto Condensed", 700],
        ["Source Sans Pro", 400],
        ["Source Sans Pro", 700],
        ["Teko", 400],
    ])("contains the example face %s %i", (family, weight) => {
        expect(
            resolveExampleFontUrl({
                family,
                style: "normal",
                weight,
                implicitFamily: false,
            })
        ).toMatch(/^https:\/\//);
    });

    test("fails instead of substituting an explicit missing variant", () => {
        expect(() =>
            resolveExampleFontUrl({
                family: "Lobster",
                style: "italic",
                weight: 400,
                implicitFamily: false,
            })
        ).toThrow("No WebGPU TrueType font");
    });
});
