import { describe, expect, test } from "vitest";
import { areRulerScaleResolutionsCompatible } from "./rulerCompatibility.js";

describe("ruler compatibility", () => {
    test("accepts matching non-locus scale types", () => {
        expect(
            areRulerScaleResolutionsCompatible(
                createResolution("linear"),
                createResolution("linear")
            )
        ).toBe(true);
    });

    test("rejects different scale types", () => {
        expect(
            areRulerScaleResolutionsCompatible(
                createResolution("linear"),
                createResolution("index")
            )
        ).toBe(false);
    });

    test("accepts locus scales with matching assemblies", () => {
        expect(
            areRulerScaleResolutionsCompatible(
                createResolution("locus", "hg38"),
                createResolution("locus", "hg38")
            )
        ).toBe(true);
    });

    test("rejects locus scales with different assemblies", () => {
        expect(
            areRulerScaleResolutionsCompatible(
                createResolution("locus", "hg19"),
                createResolution("locus", "hg38")
            )
        ).toBe(false);
    });

    test("matches locus scales that use the default assembly", () => {
        expect(
            areRulerScaleResolutionsCompatible(
                createResolution("locus", undefined, true),
                createResolution("locus", undefined, true)
            )
        ).toBe(true);
    });
});

/**
 * @param {string} type
 * @param {any} [assembly]
 * @param {boolean} [needsDefaultAssembly]
 */
function createResolution(type, assembly, needsDefaultAssembly = false) {
    return {
        getResolvedScaleType() {
            return type;
        },
        getAssemblyRequirement() {
            return {
                assembly,
                needsDefaultAssembly,
            };
        },
    };
}
