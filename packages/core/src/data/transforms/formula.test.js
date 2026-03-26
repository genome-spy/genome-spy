import { expect, test, vi } from "vitest";
import { makeParamRuntimeProvider, processData } from "../flowTestUtils.js";
import FormulaTransform from "./formula.js";

test.todo("Implement stub for ParamRuntime");

test("FormulaTransform", () => {
    const data = [{ a: 2 }, { a: 3 }];

    const t = new FormulaTransform(
        {
            type: "formula",
            expr: "datum.a * 2",
            as: "b",
        },
        makeParamRuntimeProvider()
    );

    t.initialize();

    expect(processData(t, data)).toEqual([
        { a: 2, b: 4 },
        { a: 3, b: 6 },
    ]);
});

test("FormulaTransform does not cache random expressions", () => {
    const randomSpy = vi.spyOn(Math, "random");
    randomSpy.mockImplementation(() => {
        const value = [0.1, 0.9][randomSpy.mock.calls.length - 1];
        return value ?? 0.5;
    });

    try {
        const t = new FormulaTransform(
            {
                type: "formula",
                expr: "random()",
                as: "u",
            },
            makeParamRuntimeProvider()
        );
        t.initialize();

        expect(processData(t, [{}, {}])).toEqual([{ u: 0.1 }, { u: 0.9 }]);
    } finally {
        randomSpy.mockRestore();
    }
});
