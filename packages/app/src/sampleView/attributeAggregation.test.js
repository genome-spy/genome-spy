import { describe, expect, it } from "vitest";
import {
    aggregateCount,
    aggregateMax,
    aggregateMin,
    aggregateWeightedMean,
} from "./attributeAggregation.js";

describe("attributeAggregation", () => {
    it("computes min and max", () => {
        const values = [3, -1, 5, 2];

        expect(aggregateMin(values)).toBe(-1);
        expect(aggregateMax(values)).toBe(5);
    });

    it("computes weighted mean", () => {
        const values = [1, 3, 5];
        const weights = [1, 2, 1];

        expect(aggregateWeightedMean(values, weights)).toBe(3);
    });

    it("returns undefined for empty min/max/weighted mean", () => {
        expect(aggregateMin([])).toBeUndefined();
        expect(aggregateMax([])).toBeUndefined();
        expect(aggregateWeightedMean([], [])).toBeUndefined();
    });

    it("counts values", () => {
        expect(aggregateCount([1, 2, 3])).toBe(3);
        expect(aggregateCount([])).toBe(0);
    });
});
