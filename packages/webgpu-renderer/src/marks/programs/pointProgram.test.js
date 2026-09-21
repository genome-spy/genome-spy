import { describe, expect, it } from "vitest";
import PointProgram from "./pointProgram.js";

const shaderBody = Object.getOwnPropertyDescriptor(
    PointProgram.prototype,
    "shaderBody"
).get();

describe("PointProgram", () => {
    it("suppresses invisible circle strokes", () => {
        expect(shaderBody).toContain("if (strokeOpacity <= 0.0)");
        expect(shaderBody).toContain("strokeWidth = 0.0;");
    });

    it("does not read a per-instance shape on the analytic route", () => {
        expect(shaderBody).not.toContain("getScaled_shape");
        expect(shaderBody).not.toContain("fn square");
        expect(shaderBody).not.toContain("fn crossShape");
        expect(shaderBody).toContain("let d = circle(p, r);");
    });
});
