import { describe, expect, it } from "vitest";
import PointProgram from "./pointProgram.js";

const shaderBody = Object.getOwnPropertyDescriptor(
    PointProgram.prototype,
    "shaderBody"
).get();

describe("PointProgram", () => {
    it("suppresses invisible strokes for filled shapes", () => {
        expect(shaderBody).toContain(
            "if (strokeOpacity <= 0.0 && shape != X && shape != PLUS)"
        );
        expect(shaderBody).toContain("strokeWidth = 0.0;");
    });

    it("retains invisible stroke width for line-only shapes", () => {
        expect(shaderBody).toContain("shape != X && shape != PLUS");
    });
});
