// @ts-check
import { describe, expect, test } from "vitest";
import createFunction from "./expression.js";
import { bindExpression } from "../paramRuntime/expressionRef.js";

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
        expect(createFunction("center([2, 7])")()).toBe(4.5);
        expect(createFunction("span([2, 7])")()).toBe(5);
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

    test("marks random expressions as non-deterministic", () => {
        expect(createFunction("random()").deterministic).toBe(false);
    });

    test("supports scale helpers with reactive scale dependencies", () => {
        const resolution = createFakeScaleResolution(
            [1, 5],
            (value) => value * 2
        );
        const expr = bindExpression("domain('x')", () => undefined, {
            resolveScaleResolution: (channel) =>
                channel == "x" ? resolution : undefined,
        }).expression;

        let calls = 0;
        const unsubscribe = expr.subscribe(() => {
            calls += 1;
        });

        expect(expr()).toEqual([1, 5]);

        resolution.setDomain([2, 6]);
        expect(calls).toBe(1);
        expect(expr()).toEqual([2, 6]);

        unsubscribe();
    });

    test("supports scale and invert helpers", () => {
        const resolution = createFakeScaleResolution(
            [0, 10],
            (value) => value * 3
        );
        const expr = createFunction(
            "[scale('x', 2), invert('x', 6), range('x')]",
            {},
            {
                resolveScaleResolution: (channel) =>
                    channel == "x" ? resolution : undefined,
            }
        );

        expect(expr()).toEqual([6, 2, [0, 10]]);
    });
});

/**
 * @param {number[]} initialDomain
 * @param {(value: number) => number} scaleFn
 * @returns {any}
 */
function createFakeScaleResolution(initialDomain, scaleFn) {
    let domain = initialDomain;
    const range = [0, 10];
    /** @type {Record<"domain" | "range", Set<() => void>>} */
    const listeners = {
        domain: new Set(),
        range: new Set(),
    };

    return {
        addEventListener(
            /** @type {"domain" | "range"} */ type,
            /** @type {() => void} */ listener
        ) {
            listeners[type].add(listener);
        },
        removeEventListener(
            /** @type {"domain" | "range"} */ type,
            /** @type {() => void} */ listener
        ) {
            listeners[type].delete(listener);
        },
        getDomain() {
            return domain;
        },
        getScale() {
            return Object.assign(scaleFn, {
                range: () => range,
                invert: (/** @type {number} */ value) => value / 3,
            });
        },
        setDomain(/** @type {number[]} */ nextDomain) {
            domain = nextDomain;
            for (const listener of listeners.domain) {
                listener();
            }
        },
    };
}
