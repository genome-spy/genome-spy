import { describe, expect, it } from "vitest";
import { buildScaledFunction, validateScaleConfig } from "./scaleCodegen.js";

describe("scaleCodegen validation", () => {
    it("rejects unknown scale types", () => {
        const error = validateScaleConfig("x", {
            scale: /** @type {any} */ ({ type: "mystery" }),
            type: "f32",
        });

        expect(error).toBe('Channel "x" uses unsupported scale "mystery".');
    });

    it("rejects vector components on unsupported scales", () => {
        const error = validateScaleConfig("x", {
            scale: { type: "log" },
            type: "f32",
            components: 4,
        });

        expect(error).toBe(
            'Channel "x" uses vector components but scale "log" only supports scalars.'
        );
    });

    it("allows piecewise linear scales with vec4 outputs", () => {
        const error = validateScaleConfig("fill", {
            scale: { type: "linear", domain: [0, 1, 2] },
            type: "f32",
            components: 4,
        });

        expect(error).toBeNull();
    });

    it("allows numeric input for band scales", () => {
        const error = validateScaleConfig("x", {
            scale: { type: "band" },
            type: "f32",
        });

        expect(error).toBeNull();
    });

    it("allows integer input for band scales", () => {
        const error = validateScaleConfig("x", {
            scale: { type: "band" },
            type: "u32",
        });

        expect(error).toBeNull();
    });

    it("allows identity scales with vector components", () => {
        const error = validateScaleConfig("fill", {
            scale: { type: "identity" },
            type: "f32",
            components: 4,
        });

        expect(error).toBeNull();
    });

    it("allows threshold scales with vec4 outputs", () => {
        const error = validateScaleConfig("fill", {
            scale: { type: "threshold" },
            type: "f32",
            components: 4,
        });

        expect(error).toBeNull();
    });
});

describe("scaleCodegen codegen", () => {
    it("uses domain hash maps for band scales with ordinal domains", () => {
        const code = buildScaledFunction({
            name: "x",
            scale: "band",
            rawValueExpr: "read_x(i)",
            inputScalarType: "u32",
            inputComponents: 1,
            outputComponents: 1,
            outputScalarType: "f32",
            scaleConfig: { type: "band", domain: [10, 20, 30], range: [0, 1] },
            domainMapName: "domainMap_x",
        });

        expect(code).toContain("hashLookup");
        expect(code).toContain("domainMap_x");
    });

    it("uses domain hash maps for ordinal scales with explicit domains", () => {
        const code = buildScaledFunction({
            name: "fill",
            scale: "ordinal",
            rawValueExpr: "read_fill(i)",
            inputScalarType: "u32",
            inputComponents: 1,
            outputComponents: 4,
            outputScalarType: "f32",
            scaleConfig: {
                type: "ordinal",
                domain: [3, 5, 7],
                range: [
                    [0, 0, 0, 1],
                    [1, 0, 0, 1],
                    [0, 1, 0, 1],
                ],
            },
            domainMapName: "domainMap_fill",
        });

        expect(code).toContain("hashLookup");
        expect(code).toContain("domainMap_fill");
    });
});
