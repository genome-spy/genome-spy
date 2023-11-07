import { expect, test } from "vitest";
import { processData } from "../flowTestUtils.js";
import FormulaTransform from "./formula.js";

test("FormulaTransform", () => {
    const data = [{ a: 2 }, { a: 3 }];

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
});
