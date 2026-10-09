import { expect, test } from "vitest";
import { field } from "./field.js";

test.each([
    ["Beak Length (mm)", "Beak Length (mm)"],
    ["métrique", "métrique"],
    ["a\\.b", "a.b"],
    ['["a.b"]', "a.b"],
])("validates the single property in %s", (expression, property) => {
    const accessor = field(expression);
    expect(accessor({ [property]: 2 })).toBe(2);
    expect(accessor.fields).toEqual([property]);
    expect(accessor.fname).toBe(property);
    expect(() => field(expression)({ other: 1 })).toThrow(
        `Invalid field "${property}"`
    );
});

test("preserves nested field paths", () => {
    const accessor = field('measurements[0]["Beak Length (mm)"]');
    expect(accessor({ measurements: [{ "Beak Length (mm)": 42 }] })).toBe(42);
});
