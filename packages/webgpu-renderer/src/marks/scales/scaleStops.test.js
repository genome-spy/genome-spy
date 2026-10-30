import { describe, expect, it } from "vitest";
import { normalizeOrdinalRange } from "./scaleStops.js";

describe("scaleStops", () => {
    it("normalizes ordinal color ranges", () => {
        const normalized = normalizeOrdinalRange(
            "fill",
            [
                "#000",
                "#fff",
                "transparent",
                "rgba(255, 0, 0, 0.5)",
                "#ff000080",
            ],
            4
        );

        expect(normalized).toEqual([
            [0, 0, 0, 1],
            [1, 1, 1, 1],
            [0, 0, 0, 0],
            [1, 0, 0, 0.5],
            [1, 0, 0, 128 / 255],
        ]);
    });
});
