import { describe, expect, it } from "vitest";

import { buildGlyphOffsets, hasTextShadow } from "./textRenderItems.js";

function createLayout() {
    return /** @type {import("../../index.js").TextLayout} */ ({
        glyphIds: new Uint32Array([10, 11, 12]),
        stringIndex: new Uint32Array([0, 0, 2]),
        xOffset: new Float32Array(3),
        textWidth: new Float32Array(3),
        textHeight: new Float32Array(3),
        fontSize: 12,
        lineAdvance: 12,
        ascent: 9,
        descent: 3,
    });
}

describe("text render items", () => {
    it("provisions shadow variants for retained and conditional paint", () => {
        expect(hasTextShadow()).toBe(false);
        expect(hasTextShadow({ shadowOpacity: { value: 0 } })).toBe(false);
        expect(
            hasTextShadow({ shadowOpacity: { value: 0, dynamic: true } })
        ).toBe(true);
        expect(
            hasTextShadow({
                shadowOpacity: {
                    value: 0,
                    conditions: [
                        {
                            when: { selection: "selected", type: "single" },
                            value: 0.5,
                        },
                    ],
                },
            })
        ).toBe(true);
        expect(
            hasTextShadow({
                shadowOpacity: { value: 0.5 },
                shadowColor: { value: [0, 0, 0, 0] },
            })
        ).toBe(false);
    });

    it("builds glyph offsets for empty and non-empty strings", () => {
        expect(buildGlyphOffsets(createLayout())).toEqual(
            new Uint32Array([0, 2, 2, 3])
        );
    });
});
