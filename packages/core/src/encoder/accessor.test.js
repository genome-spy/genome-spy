import { describe, expect, test } from "vitest";
import ParamMediator from "../view/paramMediator.js";
import { createAccessor, createConditionalAccessors } from "./accessor.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import { createSinglePointSelection } from "../selection/selection.js";

const datum = {
    a: 1,
    b: 2,
    "x.c": 3,
};

describe("Accessors for different encoding types", () => {
    test("Creates a field accessor", () => {
        const a = createAccessor("x", { field: "a" }, new ParamMediator());
        expect(a(datum)).toEqual(1);
        expect(a.constant).toBeFalsy();
        expect(a.fields).toEqual(["a"]);
    });

    test("Creates an expression accessor", () => {
        const a = createAccessor(
            "x",
            { expr: `datum.b + datum['x\.c']` },
            new ParamMediator()
        );
        expect(a(datum)).toEqual(5);
        expect(a.constant).toBeFalsy();
        expect(a.fields.sort()).toEqual(["b", "x.c"].sort());
    });

    test("Creates a constant accessor", () => {
        const a = createAccessor("x", { datum: 0 }, new ParamMediator());
        expect(a(datum)).toEqual(0);
        expect(a.constant).toBeTruthy();
        expect(a.fields).toEqual([]);
    });

    test("Creates a value accessor", () => {
        const a = createAccessor("x", { value: 123 }, new ParamMediator());
        expect(a(datum)).toEqual(123);
        expect(a.constant).toBeTruthy();
        expect(a.fields).toEqual([]);
    });
});

test("Throws on incomplete encoding spec", () => {
    expect(() => createAccessor("x", {}, new ParamMediator())).toThrow();
});

describe("createConditionalAccessors", () => {
    const data = [
        { a: 1, b: 2, [UNIQUE_ID_KEY]: 0 },
        { a: 3, b: 4, [UNIQUE_ID_KEY]: 1 },
    ];

    const paramMediator = new ParamMediator();
    paramMediator.allocateSetter("p", createSinglePointSelection(data[0]));

    const a = createConditionalAccessors(
        "x",
        {
            field: "a",
            type: "quantitative",
            condition: { param: "p", value: 123 },
        },
        paramMediator
    );

    test("Creates a corret number of accessors", () =>
        expect(a.length).toBe(2));

    // Conditional accessor
    test("Conditional accessor accesses the correct field", () => {
        expect(a[0].accessor(data[0])).toEqual(123);
        expect(a[0].param).toEqual("p");
    });

    test("Conditional predicate is true only for the selected datum", () => {
        expect(a[0].predicate(data[0])).toBeTruthy();
        expect(a[0].predicate(data[1])).toBeFalsy();
    });

    // Default accessor
    test("Default accessor accesses the correct field", () => {
        expect(a[1].accessor(data[0])).toEqual(1);
        expect(a[1].param).toBeNull();
    });

    test("Default predicate is true for all data", () => {
        expect(a[1].predicate(data[0])).toBeTruthy();
        expect(a[1].predicate(data[1])).toBeTruthy();
    });
});
