import { expect, test } from "vitest";
import coalesce from "./coalesce.js";

test("Coalesce returns first defined value", () => {
    expect(coalesce(0, 1, 2, 3)).toEqual(0);
    expect(coalesce(undefined, 1, 2, 3)).toEqual(1);
    expect(coalesce(undefined, undefined, 2, 3)).toEqual(2);
});

test("Coalesce returns undefined if input is all-undefined", () => {
    expect(coalesce(undefined, undefined)).toBeUndefined();
});

test("Coalesce returns undefined on empty input", () => {
    expect(coalesce()).toBeUndefined();
});
