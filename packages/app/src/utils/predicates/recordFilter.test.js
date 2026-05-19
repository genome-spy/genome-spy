import { describe, expect, it } from "vitest";
import { createRecordFilterPredicate } from "./recordFilter.js";

describe("recordFilter", () => {
    it("matches records by exact equality", () => {
        const predicate = createRecordFilterPredicate({
            field: "functionalCategory",
            operator: "eq",
            value: "frameshift",
        });

        expect(predicate({ functionalCategory: "frameshift" })).toBe(true);
        expect(predicate({ functionalCategory: "missense" })).toBe(false);
        expect(predicate({ functionalCategory: null })).toBe(false);
    });

    it("matches records by membership", () => {
        const predicate = createRecordFilterPredicate({
            field: "functionalCategory",
            operator: "in",
            values: ["frameshift", "splice_site"],
        });

        expect(predicate({ functionalCategory: "frameshift" })).toBe(true);
        expect(predicate({ functionalCategory: "splice_site" })).toBe(true);
        expect(predicate({ functionalCategory: "missense" })).toBe(false);
    });

    it("matches null values by membership", () => {
        const predicate = createRecordFilterPredicate({
            field: "functionalCategory",
            operator: "in",
            values: [null, "unknown"],
        });

        expect(
            predicate({
                functionalCategory: null,
            })
        ).toBe(true);
    });

    it("matches records by numeric comparison", () => {
        const predicate = createRecordFilterPredicate({
            field: "CADD",
            operator: "gte",
            value: 20,
        });

        expect(predicate({ CADD: 20 })).toBe(true);
        expect(predicate({ CADD: 20.1 })).toBe(true);
        expect(predicate({ CADD: 19.9 })).toBe(false);
    });

    it("uses JavaScript comparison semantics for numeric comparisons", () => {
        const predicate = createRecordFilterPredicate({
            field: "CADD",
            operator: "lt",
            value: 20,
        });

        expect(predicate({ CADD: "19.9" })).toBe(true);
        expect(predicate({ CADD: "20" })).toBe(false);
        expect(predicate({ CADD: "not a number" })).toBe(false);
    });

    it("supports all numeric comparison operators", () => {
        const matches = (/** @type {"lt" | "lte" | "gt" | "gte"} */ operator) =>
            createRecordFilterPredicate({
                field: "CADD",
                operator,
                value: 20,
            })({ CADD: 20 });

        expect(matches("lt")).toBe(false);
        expect(matches("lte")).toBe(true);
        expect(matches("gt")).toBe(false);
        expect(matches("gte")).toBe(true);
    });
});
