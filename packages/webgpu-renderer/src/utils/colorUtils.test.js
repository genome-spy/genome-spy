import { describe, expect, it, vi } from "vitest";

import { createInterpolatedColorTexture } from "./colorUtils.js";

describe("createInterpolatedColorTexture", () => {
    it("interpolates the full color-stop range", () => {
        const texture = createInterpolatedColorTexture(["black", "white"], {
            count: 3,
        });

        expect(texture.data).toEqual(
            new Uint8Array([
                0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255,
            ])
        );
    });

    it("builds one custom interpolator for each adjacent stop pair", () => {
        const factory = vi.fn(
            (a, b) => (/** @type {number} */ t) => (t < 0.5 ? a : b)
        );

        const texture = createInterpolatedColorTexture(
            ["red", "green", "blue"],
            { count: 5, interpolate: factory }
        );

        expect(factory.mock.calls).toEqual([
            ["red", "green"],
            ["green", "blue"],
        ]);
        expect(texture.data).toEqual(
            new Uint8Array([
                255, 0, 0, 255, 0, 128, 0, 255, 0, 128, 0, 255, 0, 0, 255, 255,
                0, 0, 255, 255,
            ])
        );
    });
});
