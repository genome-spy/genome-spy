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
            scale: {
                type: "linear",
                domain: [0, 1, 2],
                range: [
                    [0, 0, 0, 1],
                    [0.5, 0.5, 0.5, 1],
                    [1, 1, 1, 1],
                ],
            },
            type: "f32",
            components: 4,
        });

        expect(error).toBeNull();
    });

    it("rejects non-u32 input for band scales", () => {
        const error = validateScaleConfig("x", {
            scale: { type: "band", domain: [0, 1, 2] },
            type: "f32",
        });

        expect(error).toBe('Channel "x" requires u32 input for "band" scale.');
    });

    it("allows integer input for band scales", () => {
        const error = validateScaleConfig("x", {
            scale: { type: "band", domain: [0, 1, 2] },
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
            scale: {
                type: "threshold",
                domain: [0],
                range: [
                    [0, 0, 0, 1],
                    [1, 0, 0, 1],
                ],
            },
            type: "f32",
            components: 4,
        });

        expect(error).toBeNull();
    });

    // Vector output is only valid when a scalar output is later interpolated to a color.
    it("rejects vector outputs on interpolated-only scales without interpolation", () => {
        const error = validateScaleConfig("x", {
            scale: { type: "log", range: [0, 1] },
            type: "f32",
            components: 4,
        });

        expect(error).toBe(
            'Channel "x" uses vector components but scale "log" only supports scalars.'
        );
    });

    it("allows vector outputs on interpolated-only scales with color ranges", () => {
        const error = validateScaleConfig("fill", {
            scale: {
                type: "log",
                range: [
                    [0, 0, 0, 1],
                    [1, 1, 1, 1],
                ],
            },
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
