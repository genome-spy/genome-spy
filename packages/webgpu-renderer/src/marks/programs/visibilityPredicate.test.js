import { describe, expect, it } from "vitest";
import ArrowProgram from "./arrowProgram.js";
import LinkProgram from "./linkProgram.js";
import PointProgram from "./pointProgram.js";
import RectProgram from "./rectProgram.js";
import RuleProgram from "./ruleProgram.js";
import TextProgram from "./textProgram.js";

describe("built-in mark visibility culls", () => {
    it.each([
        ["point", PointProgram],
        ["rect", RectProgram],
        ["rule", RuleProgram],
        ["link", LinkProgram],
        ["arrow", ArrowProgram],
        ["text", TextProgram],
    ])("returns a zeroed output for a hidden %s instance", (_name, Program) => {
        const shaderBody = Object.getOwnPropertyDescriptor(
            Program.prototype,
            "shaderBody"
        ).get.call({});

        expect(shaderBody).toContain("if (!isInstanceVisible(i))");
        expect(shaderBody).toMatch(
            /fn culled[A-Za-z]+\(\) -> VSOut \{[\s\S]*?out\.pos = vec4<f32>\(0\.0\);/
        );
    });
});
