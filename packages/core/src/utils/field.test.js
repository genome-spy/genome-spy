import { expect, test } from "vitest";
import { field } from "./field.js";
import { getSpecErrorLocation } from "./specError.js";

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
    const path = 'measurements[0]["Beak Length (mm)"]';
    const accessor = field(path, "length");
    expect(accessor({ measurements: [{ "Beak Length (mm)": 42 }] })).toBe(42);
    expect(accessor({ measurements: [{}] })).toBeUndefined();
    expect(accessor.fields).toEqual([path]);
    expect(accessor.fname).toBe("length");
});

test("requires a property on every row and permits undefined or inherited values", () => {
    const location = { origin: "encoding", path: ["field"] };
    const accessor = field("value", undefined, location);
    expect(accessor({ value: undefined })).toBeUndefined();
    expect(accessor(Object.create({ value: 2 }))).toBe(2);
    expect(() => accessor({ other: 1 })).toThrow(
        'Invalid field "value". Available fields or properties: other'
    );
    expect(() => accessor({})).toThrowError(
        expect.toSatisfy((error) => getSpecErrorLocation(error) === location)
    );
});
