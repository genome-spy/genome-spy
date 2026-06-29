import { describe, expect, test } from "vitest";
import { normalizeRulerCoordinate } from "./rulerCoordinate.js";

/**
 * @param {string} type
 * @param {(value: number) => any} [toComplex]
 */
function createScaleResolution(type, toComplex) {
    return {
        getResolvedScaleType() {
            return type;
        },
        toComplex,
    };
}

describe("ruler coordinate normalization", () => {
    test("keeps quantitative coordinates continuous with auto snapping", () => {
        const resolution = createScaleResolution("linear");

        expect(normalizeRulerCoordinate(12.4, resolution, "auto")).toBe(12.4);
    });

    test("rounds quantitative coordinates with integer snapping", () => {
        const resolution = createScaleResolution("linear");

        expect(normalizeRulerCoordinate(12.6, resolution, "integer")).toBe(13);
    });

    test("rounds index coordinates with auto snapping", () => {
        const resolution = createScaleResolution("index");

        expect(normalizeRulerCoordinate(4.49, resolution, "auto")).toBe(4);
        expect(normalizeRulerCoordinate(4.5, resolution, "auto")).toBe(5);
    });

    test("rounds locus coordinates and exposes complex values", () => {
        const resolution = createScaleResolution("locus", (value) => ({
            chrom: "chr1",
            pos: value,
        }));

        expect(normalizeRulerCoordinate(20.6, resolution, "auto")).toEqual({
            chrom: "chr1",
            pos: 21,
        });
    });

    test("converts unsnapped locus coordinates to complex values", () => {
        const resolution = createScaleResolution("locus", (value) => ({
            chrom: "chr2",
            pos: value,
        }));

        expect(normalizeRulerCoordinate(10.25, resolution, false)).toEqual({
            chrom: "chr2",
            pos: 10.25,
        });
    });

    test("preserves inactive coordinates", () => {
        const resolution = createScaleResolution("index");

        expect(normalizeRulerCoordinate(null, resolution, "auto")).toBeNull();
    });
});
