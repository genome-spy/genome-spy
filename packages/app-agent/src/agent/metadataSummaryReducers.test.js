import { describe, expect, it } from "vitest";
import {
    buildCategoricalFieldSummary,
    buildQuantitativeFieldSummary,
} from "./metadataSummaryReducers.js";

describe("metadataSummaryReducers", () => {
    it("computes quartiles and IQR for quantitative summaries", () => {
        const summary = buildQuantitativeFieldSummary([1, 2, 3, 4, 100]);

        expect(summary).toEqual({
            nonMissingCount: 5,
            missingCount: 0,
            min: 1,
            max: 100,
            mean: 22,
            median: 3,
            p05: 1.2,
            p95: 80.79999999999998,
            q1: 2,
            q3: 4,
            iqr: 2,
        });
    });

    it("coerces numeric strings in quantitative summaries", () => {
        const summary = buildQuantitativeFieldSummary(["1", "2.5", "", "x"]);

        expect(summary).toEqual({
            nonMissingCount: 2,
            missingCount: 2,
            min: 1,
            max: 2.5,
            mean: 1.75,
            median: 1.75,
            p05: 1.075,
            p95: 2.425,
            q1: 1.375,
            q3: 2.125,
            iqr: 0.75,
        });
    });

    // Missing values should keep the summary compact instead of emitting NaN fields.
    it("returns only counts when all quantitative values are missing", () => {
        const summary = buildQuantitativeFieldSummary([
            undefined,
            null,
            NaN,
            "",
        ]);

        expect(summary).toEqual({
            nonMissingCount: 0,
            missingCount: 4,
        });
    });

    it("computes category shares for categorical summaries", () => {
        const summary = buildCategoricalFieldSummary(["A", "B", "A", null]);

        expect(summary).toEqual({
            nonMissingCount: 3,
            missingCount: 1,
            distinctCount: 2,
            categories: [
                { value: "A", count: 2, share: 2 / 3 },
                { value: "B", count: 1, share: 1 / 3 },
            ],
            truncated: false,
        });
    });

    // Create more distinct categories than the tool returns so truncation accounting is exercised.
    it("reports truncated categorical tails explicitly", () => {
        const summary = buildCategoricalFieldSummary([
            "A",
            "B",
            "C",
            "D",
            "E",
            "F",
            "G",
            "H",
            "I",
            "J",
            "K",
            "L",
            "M",
            "N",
            "O",
            "P",
        ]);

        expect(summary.nonMissingCount).toBe(16);
        expect(summary.missingCount).toBe(0);
        expect(summary.distinctCount).toBe(16);
        expect(summary.categories).toHaveLength(15);
        expect(summary.truncated).toBe(true);
        expect(summary.otherCount).toBe(1);
        expect(summary.otherShare).toBe(1 / 16);
        expect(summary.categories[0]).toEqual({
            value: "A",
            count: 1,
            share: 1 / 16,
        });
    });
});
