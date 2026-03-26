import { expect, test } from "vitest";
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
