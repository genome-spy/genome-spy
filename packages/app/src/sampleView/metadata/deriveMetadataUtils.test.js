// @ts-check
import { describe, it, expect } from "vitest";
import { createDerivedAttributeName } from "./deriveMetadataUtils.js";

/**
 * @param {string} name
 * @returns {import("../types.js").AttributeInfo}
 */
function makeAttributeInfo(name) {
    return /** @type {import("../types.js").AttributeInfo} */ ({
        name,
        attribute: {
            type: "SAMPLE_ATTRIBUTE",
            specifier: name,
        },
    });
}

describe("createDerivedAttributeName", () => {
    it("returns the full name when it is short and unique", () => {
        const attributeInfo = makeAttributeInfo("PurifiedLogR");

        const result = createDerivedAttributeName(attributeInfo, []);

        expect(result).toBe("PurifiedLogR");
    });

    it("compresses long names without ellipses", () => {
        const attributeInfo = makeAttributeInfo(
            "Very Long Attribute Name For Samples"
        );

        const result = createDerivedAttributeName(attributeInfo, []);

        expect(result).not.toBe(attributeInfo.name);
        expect(result.length).toBeLessThanOrEqual(20);
        expect(result.includes("...")).toBe(false);
    });

    it("adds a numeric suffix when the name collides", () => {
        const attributeInfo = makeAttributeInfo(
            "Very Long Attribute Name For Samples"
        );

        // Create a collision by reusing the first candidate.
        const first = createDerivedAttributeName(attributeInfo, []);
        const second = createDerivedAttributeName(attributeInfo, [first]);

        expect(second).not.toBe(first);
        expect(second.endsWith("-2")).toBe(true);
    });

    it("uses operator prefix and compressed attribute tokens", () => {
        const attributeInfo = makeAttributeInfo("weighted mean(purifiedLogR)");

        const result = createDerivedAttributeName(attributeInfo, []);

        expect(result).toBe("wMean_pLogR");
    });

    it("prefers compact names for filtered non-count interval aggregations", () => {
        const attributeInfo =
            /** @type {import("../types.js").AttributeInfo} */ ({
                name: "max(VAF where consequence = frameshift)",
                attribute: {
                    type: "VALUE_AT_LOCUS",
                    specifier: {
                        view: "track",
                        field: "VAF",
                        interval: [1, 2],
                        aggregation: { op: "max" },
                        featureFilter: {
                            field: "consequence",
                            operator: "eq",
                            value: "frameshift",
                        },
                    },
                },
            });

        const result = createDerivedAttributeName(attributeInfo, []);

        expect(result).toBe("max_frameshift_VAF");
    });

    it("prefers compact names for filtered count interval aggregations", () => {
        const attributeInfo =
            /** @type {import("../types.js").AttributeInfo} */ ({
                name: "count(VAF where consequence = frameshift)",
                attribute: {
                    type: "VALUE_AT_LOCUS",
                    specifier: {
                        view: "track",
                        field: "VAF",
                        interval: [1, 2],
                        aggregation: { op: "count" },
                        featureFilter: {
                            field: "consequence",
                            operator: "eq",
                            value: "frameshift",
                        },
                    },
                },
            });

        const result = createDerivedAttributeName(attributeInfo, []);

        expect(result).toBe("frameshift_count");
    });
});
