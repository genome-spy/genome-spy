import { describe, expect, it } from "vitest";
import { validateScaleConfig } from "./scaleCodegen.js";

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
