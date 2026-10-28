import { describe, expect, it } from "vitest";
import { DASH_MAX_PATTERN_LENGTH, buildDashAtlas } from "./dashAtlas.js";

describe("dashAtlas", () => {
    it("creates a minimal atlas for missing patterns", () => {
        const atlas = buildDashAtlas(null);
        expect(atlas.patternCount).toBe(0);
        expect(atlas.width).toBe(1);
        expect(atlas.height).toBe(1);
        expect(atlas.data).toEqual(new Uint8Array(4));
    });

    // These samples protect the CPU-to-WGSL interval wire contract, not a texture snapshot.
    /**
     * @param {import("./dashAtlas.js").DashAtlas} atlas
     * @param {number} bin
     * @param {number} side
     */
    const interval = (atlas, bin, side) => {
        const i = (1 + bin * 2 + side) * 4;
        return [
            atlas.data[i] + atlas.data[i + 1] * 256 - 256,
            atlas.data[i + 2] + atlas.data[i + 3] * 256 - 256,
        ];
    };

    it("keeps both neighboring painted runs at an exact boundary", () => {
        const atlas = buildDashAtlas([[3, 1, 1, 2]]);
        expect(interval(atlas, 4, 0)).toEqual([-4, -1]);
        expect(interval(atlas, 4, 1)).toEqual([0, 1]);
    });

    it("merges zero gaps and encodes solid or empty patterns", () => {
        expect(interval(buildDashAtlas([[2, 0, 2, 3]]), 2, 1)).toEqual([-2, 2]);
        expect(buildDashAtlas([[1, 0]]).data[2]).toBe(1);
        expect(buildDashAtlas([[0, 1]]).data[2]).toBe(2);
    });

    it("represents the supported maximum period without byte overflow", () => {
        const atlas = buildDashAtlas([[254, 2]]);
        expect(Array.from(atlas.data.slice(0, 2))).toEqual([0, 1]);
        expect(interval(atlas, 254, 0)).toEqual([-254, 0]);
        expect(interval(atlas, 254, 1)).toEqual([2, 256]);
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
