import { expect, test } from "vitest";
import { mergeConfigScopes } from "./mergeConfig.js";

test("merges arbitrary style names while keeping expression values atomic", () => {
    const expression = { expr: "opacity" };
    expect(
        mergeConfigScopes([
            { style: { expr: { color: "red" }, other: { size: 3 } } },
            { style: { expr: { opacity: 0.5 } } },
        ])
    ).toEqual({
        style: { expr: { color: "red", opacity: 0.5 }, other: { size: 3 } },
    });
    expect(
        mergeConfigScopes([
            { point: { opacity: { expr: "1" } } },
            { point: { opacity: expression } },
        ]).point.opacity
    ).toBe(expression);
});
