import { describe, expect, it } from "vitest";
import { buildScaleWgsl } from "./scaleWgsl.js";

describe("scaleWgsl", () => {
    it("includes common helpers and per-scale WGSL snippets", () => {
        const code = buildScaleWgsl();

        expect(code).toContain("fn clampToDomain");
        expect(code).toContain("fn scaleLinear");
        expect(code).toContain("fn scalePow");
        expect(code).toContain("fn scaleBand");
        expect(code).toContain("fn scaleBandHpU");
    });

    it("emits scale helpers in dependency order", () => {
        const code = buildScaleWgsl();
        const linearIndex = code.indexOf("fn scaleLinear");
        const powIndex = code.indexOf("fn scalePow");
        const symlogIndex = code.indexOf("fn scaleSymlog");

        expect(linearIndex).toBeGreaterThan(-1);
        expect(powIndex).toBeGreaterThan(-1);
        expect(symlogIndex).toBeGreaterThan(-1);
        expect(linearIndex).toBeLessThan(powIndex);
        expect(linearIndex).toBeLessThan(symlogIndex);
    });

    it("emits each WGSL snippet once", () => {
        const code = buildScaleWgsl();
        const matches = code.match(/fn scaleLinear\b/g) ?? [];

        expect(matches).toHaveLength(1);
    });
});
