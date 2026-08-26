import { describe, expect, it } from "vitest";
import { evaluateShaderConditionals } from "./conditionals.js";

describe("evaluateShaderConditionals", () => {
    it("evaluates defined symbols and compound expressions", () => {
        const source = `
#if defined(A) && (!defined(B) || defined(C))
enabled
#else
disabled
#endif
`;

        expect(evaluateShaderConditionals(source, new Set(["A"]))).toContain(
            "enabled"
        );
        expect(
            evaluateShaderConditionals(source, new Set(["A", "B"]))
        ).toContain("disabled");
    });

    it("evaluates nested blocks", () => {
        const source = `
#if defined(A)
#if defined(B)
both
#else
only-a
#endif
#endif
`;

        expect(evaluateShaderConditionals(source, new Set(["A"]))).toContain(
            "only-a"
        );
        expect(
            evaluateShaderConditionals(source, new Set(["A", "B"]))
        ).toContain("both");
    });

    it.each([
        ["#define A", "Unsupported directive"],
        ["#if A", "Expected defined(NAME)"],
        ["#if defined(A)\n", "Unterminated"],
        ["#else", "no matching #if"],
        ["#endif", "no matching #if"],
        ["#if defined(A)\n#else\n#else\n#endif", "more than one #else"],
    ])("rejects malformed syntax: %s", (source, message) => {
        expect(() => evaluateShaderConditionals(source, new Set())).toThrow(
            message
        );
    });
});
