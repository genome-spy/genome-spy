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
    createOutlineFontPreparer,
    resolveExampleFontUrl,
} from "./webGpuFontCatalog.js";

describe("WebGPU example font catalog", () => {
    test("uses Default Font only for the implicit regular face", async () => {
        await createOutlineFontPreparer()({
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

    test("loads only a requested application face", async () => {
        const catalog = Array.from({ length: 100 }, (_, index) => ({
            family: `Study Sans ${index}`,
            source: `https://example.test/study-sans-${index}.ttf`,
        }));
        const prepare = createOutlineFontPreparer(catalog);

        expect(loaders.loadTrueTypeFont).not.toHaveBeenCalled();
        await prepare({
            family: "Study Sans 42",
            style: "normal",
            weight: 400,
            implicitFamily: false,
        });

        expect(loaders.loadTrueTypeFont).toHaveBeenCalledOnce();
        expect(loaders.loadTrueTypeFont).toHaveBeenCalledWith(
            "https://example.test/study-sans-42.ttf"
        );
    });

    test("application faces override temporary catalog variants", async () => {
        const source = new URL("https://example.test/lato-bold.ttf");
        const prepare = createOutlineFontPreparer([
            { family: "Lato", weight: 700, source },
        ]);

        await prepare({
            family: undefined,
            style: "normal",
            weight: 700,
            implicitFamily: true,
        });

        expect(loaders.loadTrueTypeFont).toHaveBeenCalledWith(source);
    });

    test("validates catalog variants before loading", () => {
        expect(() =>
            createOutlineFontPreparer([
                { family: "Study Sans", source: "first.ttf" },
                { family: "Study Sans", source: "second.ttf" },
            ])
        ).toThrow("Duplicate font catalog entry");
        expect(() =>
            createOutlineFontPreparer([
                {
                    family: "Study Sans",
                    style: /** @type {any} */ ("oblique"),
                    source: "study-sans.ttf",
                },
            ])
        ).toThrow("Unsupported font catalog style");
    });
});
