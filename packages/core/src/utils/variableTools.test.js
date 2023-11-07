import { expect, test } from "vitest";
import * as vt from "./variableTools.js";

test("InferNumerality", () => {
    expect(vt.inferNumeric(["0", "1", "2.2", "-4"])).toBeTruthy();
    expect(vt.inferNumeric(["0", ...vt.NAs.values()])).toBeTruthy();
    expect(vt.inferNumeric([])).toBeTruthy();

    expect(vt.inferNumeric(["0", "x"])).toBeFalsy();
    expect(vt.inferNumeric(["0", " "])).toBeFalsy();
    expect(vt.inferNumeric(["0", "1,2"])).toBeFalsy();
    expect(vt.inferNumeric(["0", "20x"])).toBeFalsy();
});
