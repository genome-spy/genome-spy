import { describe, it, expect } from "vitest";
import { createDerivedAttributeName } from "./deriveMetadataUtils.js";

describe("createDerivedAttributeName", () => {
    it("returns the full name when it is short and unique", () => {
        const attributeInfo =
            /** @type {import("../types.js").AttributeInfo} */ ({
                name: "PurifiedLogR",
            });

        const result = createDerivedAttributeName(attributeInfo, []);

        expect(result).toBe("PurifiedLogR");
    });

    it("compresses long names without ellipses", () => {
        const attributeInfo =
            /** @type {import("../types.js").AttributeInfo} */ ({
                name: "Very Long Attribute Name For Samples",
            });

        const result = createDerivedAttributeName(attributeInfo, []);

        expect(result).not.toBe(attributeInfo.name);
        expect(result.length).toBeLessThanOrEqual(20);
        expect(result.includes("...")).toBe(false);
    });

    it("adds a numeric suffix when the name collides", () => {
        const attributeInfo =
            /** @type {import("../types.js").AttributeInfo} */ ({
                name: "Very Long Attribute Name For Samples",
            });

        // Create a collision by reusing the first candidate.
        const first = createDerivedAttributeName(attributeInfo, []);
        const second = createDerivedAttributeName(attributeInfo, [first]);

        expect(second).not.toBe(first);
        expect(second.endsWith("-2")).toBe(true);
    });

    it("uses operator prefix and compressed attribute tokens", () => {
        const attributeInfo =
            /** @type {import("../types.js").AttributeInfo} */ ({
                name: "weighted mean(purifiedLogR)",
            });

        const result = createDerivedAttributeName(attributeInfo, []);

        expect(result).toBe("wMean_pLogR");
    });
});
