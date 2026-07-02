import { describe, expect, test } from "vitest";

import { ARROW_UNIFORM_ENUMS, enumIndex } from "./arrow.js";

describe("arrow mark uniform enums", () => {
    test("match shader constant order", () => {
        expect(enumIndex(ARROW_UNIFORM_ENUMS.orientations, "horizontal")).toBe(
            0
        );
        expect(enumIndex(ARROW_UNIFORM_ENUMS.orientations, "vertical")).toBe(1);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.directions, "forward")).toBe(0);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.directions, "reverse")).toBe(1);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.heads, "end")).toBe(0);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.heads, "none")).toBe(1);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.headShapes, "triangle")).toBe(0);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.headShapes, "angle")).toBe(1);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.units, "px")).toBe(0);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.units, "proportion")).toBe(1);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.shortArrows, "shrinkHead")).toBe(
            0
        );
        expect(enumIndex(ARROW_UNIFORM_ENUMS.shortArrows, "triangle")).toBe(1);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.shortArrows, "hide")).toBe(2);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.headPlacements, "inside")).toBe(0);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.headPlacements, "outside")).toBe(
            1
        );
    });

    test("fails fast on unknown values", () => {
        expect(() =>
            enumIndex(ARROW_UNIFORM_ENUMS.directions, "sideways")
        ).toThrow("Unsupported arrow mark value: sideways");
        expect(() => enumIndex(ARROW_UNIFORM_ENUMS.heads, "start")).toThrow(
            "Unsupported arrow mark value: start"
        );
    });
});
