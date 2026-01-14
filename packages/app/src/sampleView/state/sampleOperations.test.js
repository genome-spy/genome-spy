import { describe, expect, it } from "vitest";
import {
    filterNominal,
    filterQuantitative,
    filterUndefined,
    retainFirstNCategories,
    retainFirstOfEachCategory,
    sort,
    wrapAccessorForComparison,
} from "./sampleOperations.js";

/**
 * @param {string[]} domain
 * @returns {(value: string) => number}
 */
function createOrdinalScale(domain) {
    /** @type {(value: string) => number} */
    const scale = (value) => {
        const index = domain.indexOf(value);
        if (index < 0) {
            return scale._unknown;
        }
        return scale._range[index];
    };

    scale._domain = domain;
    scale._range = [];
    scale._unknown = -1;

    scale.domain = () => scale._domain;
    scale.range = (values) => {
        scale._range = values;
        return scale;
    };
    scale.unknown = (value) => {
        scale._unknown = value;
        return scale;
    };
    scale.copy = () => createOrdinalScale([...scale._domain]);

    return scale;
}

describe("sampleOperations", () => {
    it("wraps accessors for comparison across attribute types", () => {
        const samples = { a: 3, b: undefined, c: "medium", d: null };
        const accessor = (id) => samples[id];

        // Minimal ordinal scale stub to exercise the wrapper's ordering behavior.
        const quantitative = wrapAccessorForComparison(accessor, {
            type: "quantitative",
        });
        const ordinal = wrapAccessorForComparison(accessor, {
            type: "ordinal",
            scale: createOrdinalScale(["low", "medium", "high"]),
        });
        const nominal = wrapAccessorForComparison(accessor, {
            type: "nominal",
        });

        expect(quantitative("a")).toBe(3);
        expect(quantitative("b")).toBe(-Infinity);
        expect(ordinal("c")).toBe(1);
        expect(ordinal("d")).toBe(-1);
        expect(nominal("d")).toBe("");
    });

    it("retains the first sample of each category", () => {
        const samples = [1, 2, 1, 3, 2];

        const retained = retainFirstOfEachCategory(samples, (x) => x);

        expect(retained).toEqual([1, 2, 3]);
    });

    it("retains samples from the first n categories", () => {
        const samples = [1, 2, 1, 3, 2, 4];

        const retained = retainFirstNCategories(samples, (x) => x, 2);

        expect(retained).toEqual([1, 2, 1, 2]);
    });

    it("sorts samples in ascending and descending order", () => {
        const samples = ["b", "c", "a"];

        expect(sort(samples, (x) => x)).toEqual(["a", "b", "c"]);
        expect(sort(samples, (x) => x, true)).toEqual(["c", "b", "a"]);
    });

    it("filters quantitative samples with comparison operators", () => {
        const samples = [1, 2, 3];

        expect(filterQuantitative(samples, (x) => x, "gt", 1)).toEqual([2, 3]);
        expect(filterQuantitative(samples, (x) => x, "lte", 2)).toEqual([1, 2]);
    });

    it("filters nominal samples by retain/remove", () => {
        const samples = ["a", "b", "a"];

        expect(filterNominal(samples, (x) => x, "retain", ["a"])).toEqual([
            "a",
            "a",
        ]);
        expect(filterNominal(samples, (x) => x, "remove", ["a"])).toEqual([
            "b",
        ]);
    });

    it("filters out undefined and null values", () => {
        const samples = [1, null, 2, undefined, 3];

        const filtered = filterUndefined(samples, (x) => x);

        expect(filtered).toEqual([1, 2, 3]);
    });
});
