import { describe, expect, test } from "vitest";

import {
    ARROW_HEAD_PLACEMENTS,
    ARROW_HEAD_SHAPES,
    enumIndex,
} from "./arrow.js";

describe("WebGL arrow uniform enums", () => {
    test("match shader constant order", () => {
        expect(enumIndex(ARROW_HEAD_SHAPES, "triangle")).toBe(0);
        expect(enumIndex(ARROW_HEAD_SHAPES, "open")).toBe(1);
        expect(enumIndex(ARROW_HEAD_PLACEMENTS, "inside")).toBe(0);
        expect(enumIndex(ARROW_HEAD_PLACEMENTS, "outside")).toBe(1);
    });

    test("fails fast on unknown values", () => {
        expect(() => enumIndex(ARROW_HEAD_SHAPES, "start")).toThrow(
            "Unsupported arrow mark value: start"
        );
    });
});
