import { describe, expect, it } from "vitest";
import {
    DASH_ATLAS_WIDTH,
    DASH_MAX_PATTERN_LENGTH,
    buildDashAtlas,
} from "./dashAtlas.js";

describe("dashAtlas", () => {
    it("creates a minimal atlas for missing patterns", () => {
        const atlas = buildDashAtlas(null);
        expect(atlas.patternCount).toBe(0);
        expect(atlas.width).toBe(1);
        expect(atlas.height).toBe(1);
        expect(atlas.data).toEqual(new Uint8Array([0]));
    });

    it("encodes lengths and samples in rows", () => {
        const atlas = buildDashAtlas([[2, 2]]);
        expect(atlas.patternCount).toBe(1);
        expect(atlas.width).toBe(DASH_ATLAS_WIDTH);
        expect(atlas.height).toBe(1);
        expect(atlas.data[0]).toBe(4);
        expect(atlas.data[1]).toBe(255);
        expect(atlas.data[2]).toBe(255);
        expect(atlas.data[3]).toBe(0);
        expect(atlas.data[4]).toBe(0);
    });

    it("accepts zero-length gaps for solid patterns", () => {
        const atlas = buildDashAtlas([[1, 0]]);
        expect(atlas.data[0]).toBe(1);
        expect(atlas.data[1]).toBe(255);
    });

    it("rejects odd segment counts", () => {
        expect(() => buildDashAtlas([[1, 2, 3]])).toThrow(
            "even number of segments"
        );
    });

    it("rejects zero-length patterns", () => {
        expect(() => buildDashAtlas([[0, 0]])).toThrow("positive total length");
    });

    it("rejects patterns that exceed max length", () => {
        const pattern = [DASH_MAX_PATTERN_LENGTH + 1, 1];
        expect(() => buildDashAtlas([pattern])).toThrow("exceeds");
    });
});
