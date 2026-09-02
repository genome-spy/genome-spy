import { describe, expect, test } from "vitest";

import { textMark } from "./text.js";

const font = {
    unitsPerEm: 1000,
    getGlyph() {},
    getPairAdjustment() {},
};

describe("textMark program identity", () => {
    test("reuses exact outline text and recreates changed glyph ordering", () => {
        const config = /** @type {any} */ ({
            font,
            channels: { text: { data: ["AB"] } },
        });

        expect(textMark.getProgramKey(config)).toBe(
            textMark.getProgramKey(config)
        );
        expect(textMark.getProgramKey(config)).not.toBe(
            textMark.getProgramKey({
                ...config,
                channels: { text: { data: ["BA"] } },
            })
        );
    });

    test("separates effect-free and effect-enabled outline programs", () => {
        const config = /** @type {any} */ ({
            font,
            channels: { text: { value: "AB" } },
        });

        expect(textMark.getProgramKey(config)).not.toBe(
            textMark.getProgramKey({
                ...config,
                channels: {
                    ...config.channels,
                    strokeWidth: { value: 0, dynamic: true },
                },
            })
        );
    });

    test("keeps bitmap text on one program route", () => {
        expect(
            textMark.getProgramKey(/** @type {any} */ ({ font: "Lato" }))
        ).toBe("bitmap");
        expect(
            textMark.getProgramKey(/** @type {any} */ ({ font: "Other" }))
        ).toBe("bitmap");
    });
});
