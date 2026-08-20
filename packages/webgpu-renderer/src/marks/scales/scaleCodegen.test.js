import { describe, expect, it } from "vitest";
import {
    buildScaledFunction,
    validateScaleConfig as validateDefinedScaleConfig,
} from "./scaleCodegen.js";
import { bandScaleDef } from "./defs/band.js";
import { ordinalScaleDef } from "./defs/ordinal.js";
import {
    attachScaleDefinitions,
    createTestScale,
} from "../../../testUtils/scaleDefinitions.js";

/**
 * @param {string} name
 * @param {import("../../index.d.ts").ChannelConfigInput} channel
 */
function validateScaleConfig(name, channel) {
    attachScaleDefinitions({ channel });
    return validateDefinedScaleConfig(name, channel);
}

describe("scaleCodegen validation", () => {
    it("accepts an attached custom definition without registration", () => {
        /** @type {import("../../index.d.ts").ScaleDef} */
        const definition = Object.freeze({
            type: "custom",
            input: "numeric",
            output: "f32",
            params: [],
            continuous: true,
            vectorOutput: "always",
            resources: {
                stopKind: null,
                needsDomainMap: false,
                needsOrdinalRange: false,
            },
            emit: ({ name }) => `fn getScaled_${name}() -> f32 { return 7.0; }`,
        });
        const scale = { type: "custom", definition };

        expect(
            validateDefinedScaleConfig("x", { scale, type: "f32" })
        ).toBeNull();
        expect(
            buildScaledFunction({
                name: "x",
                scaleDef: definition,
                rawValueExpr: "read_x(i)",
                scalarType: "f32",
                inputComponents: 1,
                outputComponents: 1,
                outputScalarType: "f32",
                scaleConfig: scale,
            })
        ).toContain("return 7.0");
    });

    it("rejects unknown scale types", () => {
        expect(() =>
            validateDefinedScaleConfig("x", {
                scale: /** @type {any} */ ({ type: "mystery" }),
                type: "f32",
            })
        ).toThrow(
            'Scale "mystery" has no definition. Import and use its scale factory.'
        );
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

    it("allows quantize scales with vec4 outputs", () => {
        const error = validateScaleConfig("fill", {
            scale: {
                type: "quantize",
                domain: [0, 1],
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

    it("rejects quantize scales with invalid domain length", () => {
        const error = validateScaleConfig("x", {
            scale: {
                type: "quantize",
                domain: [0, 1, 2],
                range: [0, 1],
            },
            type: "f32",
        });

        expect(error).toBe(
            'Quantize scale on "x" requires a domain with exactly two entries.'
        );
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
            scaleDef: bandScaleDef,
            rawValueExpr: "read_x(i)",
            scalarType: "u32",
            inputComponents: 1,
            outputComponents: 1,
            outputScalarType: "f32",
            scaleConfig: createTestScale("band", {
                domain: [10, 20, 30],
                range: [0, 1],
            }),
            domainMapName: "domainMap_x",
        });

        expect(code).toContain("hashLookup");
        expect(code).toContain("domainMap_x");
    });

    it("uses domain hash maps for ordinal scales with explicit domains", () => {
        const code = buildScaledFunction({
            name: "fill",
            scaleDef: ordinalScaleDef,
            rawValueExpr: "read_fill(i)",
            scalarType: "u32",
            inputComponents: 1,
            outputComponents: 4,
            outputScalarType: "f32",
            scaleConfig: createTestScale("ordinal", {
                domain: [3, 5, 7],
                range: [
                    [0, 0, 0, 1],
                    [1, 0, 0, 1],
                    [0, 1, 0, 1],
                ],
            }),
            domainMapName: "domainMap_fill",
        });

        expect(code).toContain("hashLookup");
        expect(code).toContain("domainMap_fill");
    });
});
