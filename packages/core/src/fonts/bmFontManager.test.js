import { describe, expect, test } from "vitest";
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
});
