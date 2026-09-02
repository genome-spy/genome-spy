import { describe, expect, it } from "vitest";

import {
    buildGlyphOffsets,
    buildTextRenderItems,
    resolveTextEffectLayers,
    TEXT_LAYER_FILL,
    TEXT_LAYER_OUTLINE,
    TEXT_LAYER_SHADOW,
} from "./textRenderItems.js";

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
    it("distinguishes static absence from retained effect potential", () => {
        expect(resolveTextEffectLayers()).toEqual({
            shadow: false,
            outline: false,
            enabled: false,
        });
        expect(
            resolveTextEffectLayers({
                strokeWidth: { value: 0 },
                shadowOpacity: { value: 0 },
            })
        ).toEqual({ shadow: false, outline: false, enabled: false });
        expect(
            resolveTextEffectLayers({
                strokeWidth: { value: 0, dynamic: true },
            })
        ).toEqual({ shadow: false, outline: true, enabled: true });
        expect(
            resolveTextEffectLayers({
                shadowOpacity: { data: new Float32Array([0]), type: "f32" },
            })
        ).toEqual({ shadow: true, outline: false, enabled: true });
        expect(
            resolveTextEffectLayers({
                strokeWidth: {
                    value: 0,
                    conditions: [
                        {
                            when: { selection: "selected", type: "single" },
                            value: 2,
                        },
                    ],
                },
            })
        ).toEqual({ shadow: false, outline: true, enabled: true });
        expect(
            resolveTextEffectLayers({
                strokeWidth: { value: 2 },
                strokeOpacity: { value: 0 },
                shadowOpacity: { value: 0.5 },
                shadowColor: { value: [0, 0, 0, 0] },
            })
        ).toEqual({ shadow: false, outline: false, enabled: false });
    });

    it("builds glyph offsets for empty and non-empty strings", () => {
        expect(buildGlyphOffsets(createLayout())).toEqual(
            new Uint32Array([0, 2, 2, 3])
        );
    });

    it("keeps effect-free text at one item per glyph", () => {
        const result = buildTextRenderItems(createLayout(), {
            shadow: false,
            outline: false,
        });

        expect(result.data).toEqual(
            new Uint32Array([
                0,
                TEXT_LAYER_FILL,
                1,
                TEXT_LAYER_FILL,
                2,
                TEXT_LAYER_FILL,
            ])
        );
        expect(result.offsets).toEqual(new Uint32Array([0, 2, 2, 3]));
    });

    it("orders glyph layers within each logical label", () => {
        const result = buildTextRenderItems(createLayout(), {
            shadow: true,
            outline: true,
        });

        expect(result.data).toEqual(
            new Uint32Array([
                0,
                TEXT_LAYER_SHADOW,
                1,
                TEXT_LAYER_SHADOW,
                0,
                TEXT_LAYER_OUTLINE,
                1,
                TEXT_LAYER_OUTLINE,
                0,
                TEXT_LAYER_FILL,
                1,
                TEXT_LAYER_FILL,
                2,
                TEXT_LAYER_SHADOW,
                2,
                TEXT_LAYER_OUTLINE,
                2,
                TEXT_LAYER_FILL,
            ])
        );
        expect(result.offsets).toEqual(new Uint32Array([0, 6, 6, 9]));
    });
});
