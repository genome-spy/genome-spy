import { expect, test, test } from "vitest";
import { makeParamMediatorProvider, processData } from "../flowTestUtils.js";
import FormulaTransform from "./formula.js";

test.todo("Implement stub for ParamMediator");

test("FormulaTransform", () => {
    const data = [{ a: 2 }, { a: 3 }];

    const t = new FormulaTransform(
        {
            type: "formula",
            expr: "datum.a * 2",
            as: "b",
        },
        makeParamMediatorProvider()
    );

    t.initialize();

    expect(processData(t, data)).toEqual([
        { a: 2, b: 4 },
        { a: 3, b: 6 },
    ]);
});
