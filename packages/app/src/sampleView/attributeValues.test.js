import { describe, expect, it } from "vitest";
import {
    createDefaultValuesProvider,
    extractAttributeValues,
} from "./attributeValues.js";

describe("extractAttributeValues", () => {
    it("uses the default provider for accessors", () => {
        const attributeInfo = {
            name: "value",
            title: "value",
            emphasizedName: "value",
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "value" },
            accessor: (id) => (id === "a" ? 3 : 4),
            valuesProvider: createDefaultValuesProvider((id) =>
                id === "a" ? 3 : 4
            ),
            type: "quantitative",
        };
        const values = extractAttributeValues(attributeInfo, ["a", "b"], {
            a: 3,
            b: 4,
        });

        expect(values).toEqual([3, 4]);
    });

    it("prefers valuesProvider when present", () => {
        const attributeInfo = {
            name: "value",
            title: "value",
            emphasizedName: "value",
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "value" },
            accessor: () => "unused",
            valuesProvider: () => [1, 2],
            type: "quantitative",
        };

        const values = extractAttributeValues(attributeInfo, ["a"], {});

        expect(values).toEqual([1, 2]);
    });
});
