import { expect, test, test } from "vitest";
import { processData } from "../flowTestUtils.js";
import FormulaTransform from "./formula.js";

test.todo("Implement stub for ParamMediator");

test("FormulaTransform", () => {
    const data = [{ a: 2 }, { a: 3 }];

    /* TODO: Enable this test, implement stub for ParamMediator

    const t = new FormulaTransform({
        type: "formula",
        expr: "datum.a * 2",
        as: "b",
    });
    t.initialize();

    expect(processData(t, data)).toEqual([
        { a: 2, b: 4 },
        { a: 3, b: 6 },
    ]);

    */
});
