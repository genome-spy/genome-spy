import { describe, expect, test } from "vitest";
import { isSampleFacetVisible } from "./sampleFacet.js";

describe("sample facet visibility", () => {
    test.each([
        ["upper edge contact", facet(100, 20), true],
        ["lower edge contact", facet(-20, 20), true],
        ["upper partial overlap", facet(90, 20), true],
        ["lower partial overlap", facet(-10, 20), true],
        ["wholly above", facet(101, 20), false],
        ["wholly below", facet(-21, 20), false],
        ["non-finite position", facet(Number.NaN, 20), true],
    ])("handles %s", (_name, sampleFacet, expected) => {
        expect(isSampleFacetVisible(sampleFacet)).toBe(expected);
    });
});

/** @param {number} location @param {number} size */
function facet(location, size) {
    return {
        locSize: { location, size },
        pixelToUnit: 0.01,
    };
}
