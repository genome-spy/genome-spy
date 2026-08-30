import { expect, test } from "vitest";
import { normalizeGenomicStrand } from "./genomicStrand.js";

test("normalizes known parser strand domains", () => {
    expect(normalizeGenomicStrand("+")).toBe("+");
    expect(normalizeGenomicStrand(1)).toBe("+");
    expect(normalizeGenomicStrand("-")).toBe("-");
    expect(normalizeGenomicStrand(-1)).toBe("-");
    expect(normalizeGenomicStrand(".")).toBeNull();
    expect(normalizeGenomicStrand(0)).toBeNull();
    expect(normalizeGenomicStrand(null)).toBeNull();
    expect(normalizeGenomicStrand(undefined)).toBeNull();
});

test("rejects unexpected strand values", () => {
    expect(() =>
        normalizeGenomicStrand(/** @type {any} */ ("forward"))
    ).toThrow('Unexpected genomic strand: "forward"');
});
