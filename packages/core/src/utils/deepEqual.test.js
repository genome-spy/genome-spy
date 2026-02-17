import { expect, test } from "vitest";
import deepEqual from "./deepEqual.js";

test("compares primitives and references", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(1, "1")).toBe(false);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
    expect(deepEqual(NaN, NaN)).toBe(true);
});

test("compares arrays deeply", () => {
    expect(deepEqual([1, 2, { a: 3 }], [1, 2, { a: 3 }])).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
});

test("compares plain objects deeply", () => {
    expect(
        deepEqual(
            { a: 1, b: { c: [1, 2], d: "x" } },
            { a: 1, b: { c: [1, 2], d: "x" } }
        )
    ).toBe(true);

    // Key order should not matter.
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);

    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
});

test("treats non-plain objects as reference-equal only", () => {
    const d1 = new Date("2024-01-01T00:00:00Z");
    const d2 = new Date("2024-01-01T00:00:00Z");

    expect(deepEqual(d1, d1)).toBe(true);
    expect(deepEqual(d1, d2)).toBe(false);
});

test("supports null-prototype objects", () => {
    const a = Object.create(null);
    const b = Object.create(null);
    a.x = { y: [1, 2, 3] };
    b.x = { y: [1, 2, 3] };

    expect(deepEqual(a, b)).toBe(true);
});
