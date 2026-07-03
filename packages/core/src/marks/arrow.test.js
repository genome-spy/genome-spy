import { describe, expect, test } from "vitest";

import { ARROW_UNIFORM_ENUMS, enumIndex, inferArrowOrient } from "./arrow.js";

describe("arrow mark uniform enums", () => {
    test("match shader constant order", () => {
        expect(enumIndex(ARROW_UNIFORM_ENUMS.orientations, "horizontal")).toBe(
            0
        );
        expect(enumIndex(ARROW_UNIFORM_ENUMS.orientations, "vertical")).toBe(1);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.directions, "forward")).toBe(0);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.directions, "reverse")).toBe(1);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.headShapes, "triangle")).toBe(0);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.headShapes, "open")).toBe(1);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.units, "px")).toBe(0);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.units, "proportion")).toBe(1);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.headPlacements, "inside")).toBe(0);
        expect(enumIndex(ARROW_UNIFORM_ENUMS.headPlacements, "outside")).toBe(
            1
        );
    });

    test("fails fast on unknown values", () => {
        expect(() =>
            enumIndex(ARROW_UNIFORM_ENUMS.directions, "sideways")
        ).toThrow("Unsupported arrow mark value: sideways");
        expect(() =>
            enumIndex(ARROW_UNIFORM_ENUMS.headShapes, "start")
        ).toThrow("Unsupported arrow mark value: start");
    });
});

describe("arrow mark orient inference", () => {
    test("uses the directional quantitative/index/locus axis", () => {
        expect(
            inferArrowOrient({
                x: { field: "start", type: "index" },
                y: { field: "sample", type: "nominal" },
            })
        ).toBe("horizontal");

        expect(
            inferArrowOrient({
                x: { field: "sample", type: "nominal" },
                y: { field: "position", type: "locus" },
            })
        ).toBe("vertical");
    });

    test("uses the ranged channel axis when only one secondary channel exists", () => {
        expect(
            inferArrowOrient({
                x: { field: "start", type: "quantitative" },
                x2: { field: "end" },
            })
        ).toBe("horizontal");

        expect(
            inferArrowOrient({
                y: { field: "start", type: "quantitative" },
                y2: { field: "end" },
            })
        ).toBe("vertical");
    });

    test("falls back to horizontal for ambiguous two-axis encodings", () => {
        expect(
            inferArrowOrient({
                x: { field: "start", type: "quantitative" },
                y: { field: "end", type: "quantitative" },
            })
        ).toBe("horizontal");
    });
});
