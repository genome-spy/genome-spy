// @ts-check
import { describe, expect, test } from "vitest";
import createFunction from "./expression.js";

describe("expression helpers", () => {
    test("supports Vega sequence helpers missing from vega-expression", () => {
        // These expressions exercise helpers that the installed dependency
        // does not expose directly.
        expect(createFunction("indexof('zscore_10p', 'zscore_')")()).toBe(0);
        expect(createFunction("lastindexof('banana', 'an')")()).toBe(3);
        expect(createFunction("join([1, 2, 3], '-')")()).toBe("1-2-3");
        expect(createFunction("reverse([1, 2, 3])")()).toEqual([3, 2, 1]);
        expect(createFunction("slice([1, 2, 3, 4], 1, 3)")()).toEqual([2, 3]);
        expect(createFunction("sort([3, 1, 2])")()).toEqual([1, 2, 3]);
    });

    test("matches Vega null and undefined handling for sequence helpers", () => {
        expect(() => createFunction("join(null)")()).toThrow(
            "Cannot read properties of null"
        );
        expect(() => createFunction("indexof(undefined, 'a')")()).toThrow(
            "Cannot read properties of null"
        );
        expect(() => createFunction("lastindexof(null, 'a')")()).toThrow(
            "Cannot read properties of null"
        );
        expect(() => createFunction("reverse(undefined)")()).toThrow(
            "Cannot read properties of null"
        );
        expect(() => createFunction("slice(null, 0)")()).toThrow(
            "Cannot read properties of null"
        );
        expect(() => createFunction("sort(undefined)")()).toThrow(
            "Cannot read properties of null"
        );
    });

    test("exposes GenomeSpy expression helpers", () => {
        expect(
            createFunction("mapHasKey(map, 'a')", {
                map: new Map([["a", 1]]),
            })()
        ).toBe(true);
        expect(createFunction("isDefined(undefined)")()).toBe(false);
        expect(createFunction("isDefined(null)")()).toBe(true);
        expect(createFunction("isValid(NaN)")()).toBe(false);
        expect(createFunction("isValid(42)")()).toBe(true);
    });
});
