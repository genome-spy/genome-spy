import { describe, expect, it } from "vitest";
import { collectExampleValues } from "./exampleValues.js";

describe("collectExampleValues", () => {
    it("returns stable hashed examples instead of the first values", () => {
        const values = ["TP53", "MYC", "EGFR", "PTEN", "KRAS"];

        const examples = collectExampleValues(values, 2);
        const secondExamples = collectExampleValues(values, 2);

        expect(secondExamples).toEqual(examples);
        expect(examples).toHaveLength(2);
        expect(examples).not.toEqual(["TP53", "MYC"]);
    });

    it("trims empty values before sampling examples", () => {
        expect(collectExampleValues(["", "  ", null, " TP53 "], 3)).toEqual([
            "TP53",
        ]);
    });
});
