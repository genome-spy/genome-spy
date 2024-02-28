import { expect, test } from "vitest";
import ParamMediator from "../view/paramMediator.js";
import createAccessor from "./accessor.js";

const datum = {
    a: 1,
    b: 2,
    "x.c": 3,
};

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

test("Throws on incomplete encoding spec", () => {
    expect(() => createAccessor("x", {}, new ParamMediator())).toThrow();
});
