import { expect, test } from "vitest";

import { hasWindowCoverageChanged, quantizeInterval } from "./windowing.js";

test("quantizes a domain to complete fixed-size windows", () => {
    expect(quantizeInterval([21, 39], 20, 100)).toEqual([20, 40]);
    expect(quantizeInterval([19, 21], 20, 100)).toEqual([0, 40]);
    expect(quantizeInterval([-10, 101], 20, 100)).toEqual([0, 100]);
});

test("only requests when the visible domain leaves loaded coverage", () => {
    expect(hasWindowCoverageChanged([20, 40], undefined)).toBe(true);
    expect(hasWindowCoverageChanged([25, 35], [20, 40])).toBe(false);
    expect(hasWindowCoverageChanged([10, 35], [20, 40])).toBe(true);
    expect(hasWindowCoverageChanged([25, 50], [20, 40])).toBe(true);
});
