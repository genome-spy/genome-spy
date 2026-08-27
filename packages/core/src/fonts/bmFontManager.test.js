import { describe, expect, test, vi } from "vitest";
import BmFontManager from "./bmFontManager.js";

describe("BmFontManager", () => {
    test("uses the embedded default font for the bundled Lato face", () => {
        const manager = new BmFontManager();

        expect(manager.getFont("Lato")).toBe(manager.getDefaultFont());
        expect(manager.getFont("Lato", "normal", 400)).toBe(
            manager.getDefaultFont()
        );
        expect(manager.getFont("sans-serif")).toBe(manager.getDefaultFont());
    });

    test("loads non-default metrics without renderer resources", async () => {
        const manager = new BmFontManager();
        const metrics = manager.getDefaultFont().metrics;
        vi.spyOn(manager, "_loadMetadata").mockResolvedValue([
            /** @type {any} */ ({
                name: "Test Sans",
                style: "normal",
                weight: 700,
                filename: "TestSans-Bold.ttf",
            }),
        ]);
        vi.spyOn(manager, "_loadFont").mockResolvedValue(metrics);
        const font = manager.getFont("Test Sans", "normal", 700);
        await manager.waitUntilReady();

        expect(font.metrics).toBe(metrics);
        expect(font.rendererResource).toBeUndefined();
    });

    test("loads bitmap resources through the renderer-owned loader", async () => {
        const loadRendererResource = vi.fn((bitmapUrl) => ({
            resource: { bitmapUrl },
            ready: Promise.resolve(),
        }));
        const manager = new BmFontManager(loadRendererResource);
        const metrics = manager.getDefaultFont().metrics;
        vi.spyOn(manager, "_loadMetadata").mockResolvedValue([
            /** @type {any} */ ({
                name: "Test Sans",
                style: "normal",
                weight: 700,
                filename: "TestSans-Bold.ttf",
            }),
        ]);
        vi.spyOn(manager, "_loadFont").mockResolvedValue(metrics);

        const font = manager.getFont("Test Sans", "normal", 700);
        await manager.waitUntilReady();

        expect(loadRendererResource).toHaveBeenCalledTimes(2);
        expect(font.rendererResource).toEqual({
            bitmapUrl: expect.stringContaining("TestSans-Bold.png"),
        });
    });
});
