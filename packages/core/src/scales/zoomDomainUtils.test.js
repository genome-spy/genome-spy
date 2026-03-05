import { describe, expect, test } from "vitest";

import { zoomDomainByScaleType } from "./zoomDomainUtils.js";

describe("zoomDomainByScaleType", () => {
    test("zooms linear domains", () => {
        expect(
            zoomDomainByScaleType(
                /** @type {any} */ ({ type: "linear" }),
                [0, 10],
                5,
                0.5
            )
        ).toEqual([2.5, 7.5]);
    });

    test("zooms pow domains using scale exponent", () => {
        // Non-obvious setup: the helper expects d3-like exponent() on pow scales.
        const powScale = /** @type {any} */ ({
            type: "pow",
            exponent: () => 2,
        });

        const zoomed = zoomDomainByScaleType(powScale, [1, 9], 5, 0.5);
        expect(zoomed[0]).toBeCloseTo(3.605551275463989);
        expect(zoomed[1]).toBeCloseTo(7.280109889280518);
    });

    test("zooms symlog domains using scale constant", () => {
        const symlogScale = /** @type {any} */ ({
            type: "symlog",
            constant: () => 1,
        });

        const zoomed = zoomDomainByScaleType(symlogScale, [-10, 10], 0, 0.5);
        expect(zoomed[0]).toBeLessThan(0);
        expect(zoomed[1]).toBeGreaterThan(0);
        expect(zoomed[1] - zoomed[0]).toBeLessThan(20);
    });

    test("throws on unsupported scales by default", () => {
        expect(() =>
            zoomDomainByScaleType(
                /** @type {any} */ ({ type: "ordinal" }),
                [0, 10],
                5,
                0.5
            )
        ).toThrowError("Zooming is not implemented for: ordinal");
    });

    test("can keep the domain unchanged on unsupported scales", () => {
        expect(
            zoomDomainByScaleType(
                /** @type {any} */ ({ type: "ordinal" }),
                [0, 10],
                5,
                0.5,
                { onUnsupported: "identity" }
            )
        ).toEqual([0, 10]);
    });
});
