import { describe, expect, it } from "vitest";
import { extractAttributeValues } from "./attributeValues.js";

describe("extractAttributeValues", () => {
    it("prefers valuesProvider when present", () => {
        const attributeInfo = {
            accessor: () => "unused",
            valuesProvider: () => [1, 2],
        };

        const values = extractAttributeValues(attributeInfo, ["a"], {});

        expect(values).toEqual([1, 2]);
    });

    it("falls back to accessor without valuesProvider", () => {
        const attributeInfo = {
            accessor: (id) => (id === "a" ? 3 : 4),
        };

        const values = extractAttributeValues(attributeInfo, ["a", "b"], {});

        expect(values).toEqual([3, 4]);
    });
});
