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

    test("loads non-default metrics without creating a texture when GL is absent", async () => {
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
        const createTexture = vi.spyOn(manager, "_createTexture");

        const font = manager.getFont("Test Sans", "normal", 700);
        await manager.waitUntilReady();

        expect(font.metrics).toBe(metrics);
        expect(font.texture).toBeUndefined();
        expect(createTexture).not.toHaveBeenCalled();
    });
});
