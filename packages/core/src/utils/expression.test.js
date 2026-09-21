// @ts-check
import { describe, expect, test } from "vitest";
import createFunction, { analyzeExpression } from "./expression.js";
import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import { bindExpression } from "../paramRuntime/expressionRef.js";

describe("expression helpers", () => {
    test("computes nicely rounded tick steps", () => {
        expect(createFunction("tickStep(0, 12000000, 2)")()).toBe(5000000);
        expect(createFunction("tickStep(0, 3000000, 2)")()).toBe(2000000);
        expect(createFunction("tickStep(0, 0.8, 2)")()).toBe(0.5);
        expect(createFunction("tickStep(10, 0, 2)")()).toBe(-5);
    });

    test("analyzes scale helpers and referenced globals", () => {
        expect(analyzeExpression("width * scale('x', step)")).toEqual({
            usesScaleHelper: true,
            globals: ["width", "step"],
        });
        expect(analyzeExpression("domain('y')[offset]")).toEqual({
            usesScaleHelper: true,
            globals: ["offset"],
        });
        expect(analyzeExpression("zoomLevel() * zoomLevel('x')")).toEqual({
            usesScaleHelper: true,
            globals: [],
        });
        expect(analyzeExpression("datum.value + scaleFactor")).toEqual({
            usesScaleHelper: false,
            globals: ["scaleFactor"],
        });
    });

    test("supports Vega sequence helpers missing from vega-expression", () => {
        // These expressions exercise helpers that the installed dependency
        // does not expose directly.
        expect(createFunction("indexof('zscore_10p', 'zscore_')")()).toBe(0);
        expect(createFunction("lastindexof('banana', 'an')")()).toBe(3);
        expect(createFunction("join([1, 2, 3], '-')")()).toBe("1-2-3");
        expect(createFunction("reverse([1, 2, 3])")()).toEqual([3, 2, 1]);
        expect(createFunction("reverse('ACGT')")()).toBe("TGCA");
        // Array.from prevents splitting a Unicode code point into surrogates.
        expect(createFunction("reverse('A😀C')")()).toBe("C😀A");
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

    test("matches Vega's inrange helper", () => {
        expect(createFunction("inrange(2, [2, 5])")()).toBe(true);
        expect(createFunction("inrange(5, [2, 5])")()).toBe(true);
        expect(createFunction("inrange(2, [5, 2])")()).toBe(true);
        expect(createFunction("inrange(5, [5, 2])")()).toBe(true);
        expect(createFunction("inrange(2, [2, 5], false, true)")()).toBe(false);
        expect(createFunction("inrange(5, [2, 5], true, false)")()).toBe(false);
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

    test("supports bandwidth helper with reactive scale dependencies", () => {
        const resolution = createFakeScaleResolution(
            ["a", "b"],
            (value) => value
        );
        const expr = bindExpression("bandwidth('y')", () => undefined, {
            resolveScaleResolution: (channel) =>
                channel == "y" ? resolution : undefined,
        }).expression;

        let calls = 0;
        const unsubscribe = expr.subscribe(() => {
            calls += 1;
        });

        expect(expr()).toBe(5);

        resolution.setRange([0, 20]);
        expect(calls).toBe(1);
        expect(expr()).toBe(10);

        resolution.setDomain(["a", "b", "c", "d"]);
        expect(calls).toBe(2);
        expect(expr()).toBe(5);

        unsubscribe();
    });

    test("supports linearize helper", () => {
        const resolution = createFakeScaleResolution(
            [0, 10],
            (value) => value * 3,
            (value) =>
                typeof value == "number" ? value : value.chromOffset + value.pos
        );
        const expr = createFunction(
            "linearize('x', datum.value)",
            {},
            {
                resolveScaleResolution: (channel) =>
                    channel == "x" ? resolution : undefined,
            }
        );

        expect(expr({ value: 5 })).toBe(5);
        expect(expr({ value: { chromOffset: 100, pos: 7 } })).toBe(107);
        expect(expr({ value: null })).toBeNull();
    });

    test("supports automatic and channel-specific zoom levels", () => {
        const x = createFakeScaleResolution([0, 10], (value) => value);
        const y = createFakeScaleResolution([0, 10], (value) => value);
        const resolveScaleResolution = (/** @type {string} */ channel) =>
            channel == "x" ? x : channel == "y" ? y : undefined;
        const automatic = bindExpression("zoomLevel()", () => undefined, {
            resolveScaleResolution,
        }).expression;
        const explicit = bindExpression("zoomLevel('x')", () => undefined, {
            resolveScaleResolution,
        }).expression;

        let calls = 0;
        automatic.subscribe(() => {
            calls += 1;
        });

        expect(automatic()).toBe(1);
        expect(explicit()).toBe(1);

        x.setZoomLevel(4);
        y.setZoomLevel(9);

        expect(automatic()).toBe(6);
        expect(explicit()).toBe(4);
        expect(calls).toBe(2);
    });

    test("validates zoom level channels statically", () => {
        const resolution = createFakeScaleResolution([0, 10], (value) => value);
        const options = {
            resolveScaleResolution: (/** @type {string} */ channel) =>
                channel == "x" ? resolution : undefined,
        };

        expect(createFunction("zoomLevel()", {}, options)()).toBe(1);
        expect(() => createFunction("zoomLevel(channel)", {}, options)).toThrow(
            'Scale helper "zoomLevel" requires a literal channel name.'
        );
        expect(() =>
            createFunction("zoomLevel('x', 'y')", {}, options)
        ).toThrow(
            'Scale helper "zoomLevel" accepts zero arguments or one literal channel name.'
        );
        expect(() => createFunction("zoomLevel('y')", {}, options)).toThrow(
            'Unknown scale channel "y" in expression helper "zoomLevel".'
        );
    });
});

/**
 * @param {any[]} initialDomain
 * @param {(value: number) => number} scaleFn
 * @param {(value: any) => number} [fromComplex]
 * @returns {any}
 */
function createFakeScaleResolution(initialDomain, scaleFn, fromComplex) {
    let domain = initialDomain;
    let range = [0, 10];
    const runtime = new ViewParamRuntime();
    const domainRef = runtime.signal("domain", domain);
    const mapping = runtime.signal("mapping revision", 0);
    const configuration = runtime.signal("configuration revision", 0);
    const zoomLevel = runtime.signal("zoom level", 1);

    return {
        getDomainRef: () => domainRef,
        getMappingRef: () => mapping,
        getConfigurationRef: () => configuration,
        getZoomLevelRef: () => zoomLevel,
        getZoomLevel: () => zoomLevel.get(),
        getDomain() {
            return domain;
        },
        getScale() {
            return Object.assign(scaleFn, {
                range: () => range,
                invert: (/** @type {number} */ value) => value / 3,
                bandwidth: () => (range[1] - range[0]) / domain.length,
            });
        },
        fromComplex(/** @type {any} */ value) {
            return fromComplex ? fromComplex(value) : value;
        },
        setDomain(/** @type {number[]} */ nextDomain) {
            domain = nextDomain;
            domainRef.set(domain);
            mapping.set(mapping.get() + 1);
        },
        setRange(/** @type {number[]} */ nextRange) {
            range = nextRange;
            mapping.set(mapping.get() + 1);
        },
        setZoomLevel(/** @type {number} */ nextZoomLevel) {
            zoomLevel.set(nextZoomLevel);
        },
    };
}
