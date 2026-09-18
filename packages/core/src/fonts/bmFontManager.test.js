import { describe, expect, test, vi } from "vitest";
import BmFontManager from "./bmFontManager.js";

describe("BmFontManager", () => {
    test("uses bundled default metrics for the Lato face", () => {
        const manager = new BmFontManager();

        expect(manager.getFont("Lato")).toBe(manager.getDefaultFont());
        expect(manager.getFont("Lato", "normal", 400)).toBe(
            manager.getDefaultFont()
        );
        expect(manager.getFont("sans-serif")).toBe(manager.getDefaultFont());
        expect(manager.getDefaultFont().bitmapUrl).toBeUndefined();
    });

    test("loads non-default metrics without bitmap preparation", async () => {
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
        expect(font.bitmapUrl).toContain("TestSans-Bold.png");
    });

    test("prepares bitmaps through the renderer-owned callback", async () => {
        const prepareBitmap = vi.fn(() => Promise.resolve());
        const manager = new BmFontManager(prepareBitmap, "default.png");
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

        expect(prepareBitmap).toHaveBeenCalledTimes(2);
        expect(prepareBitmap).toHaveBeenNthCalledWith(1, "default.png");
        expect(prepareBitmap).toHaveBeenLastCalledWith(
            expect.stringContaining("TestSans-Bold.png")
        );
        expect(font.bitmapUrl).toContain("TestSans-Bold.png");
    });
});
