import { describe, expect, it } from "vitest";
import {
    analyzeTestChannels,
    compileTestMarkChannels,
} from "../../../testUtils/scaleDefinitions.js";
import { compileMarkChannels } from "./channelIR.js";

/** @param {Record<string, import("../../index.d.ts").ChannelConfigResolved>} channels */
function buildChannelIRs(channels) {
    return compileTestMarkChannels(channels).channelIRs;
}

describe("channelIR", () => {
    it("retains the supplied analysis map as the shared source of truth", () => {
        const channels = {
            x: /** @type {import("../../index.d.ts").ChannelConfigResolved} */ ({
                value: 1,
                type: "f32",
                components: 1,
            }),
        };
        const analysisByChannel = analyzeTestChannels(channels);
        const compiled = compileMarkChannels({
            channels,
            analysisByChannel,
            channelNames: new Set(["x"]),
            inputNames: new Set(),
        });

        expect(compiled.analysisByChannel).toBe(analysisByChannel);
        expect(compiled.channelIRs[0].scaleDef).toBe(
            analysisByChannel.get("x").scaleDef
        );
    });

    it("keeps value-backed threshold inputs scalar", () => {
        const [ir] = buildChannelIRs({
            fill: {
                value: 0.5,
                type: "f32",
                components: 4,
                scale: {
                    type: "threshold",
                    domain: [0],
                    range: [
                        [0, 0, 0, 1],
                        [1, 1, 1, 1],
                    ],
                },
            },
        });

        expect(ir.inputComponents).toBe(1);
        expect(ir.rawValueExpr).toBe("0.5");
        expect(ir.needsScaleFunction).toBe(true);
    });

    it("emits vec4 literals for identity value channels", () => {
        const [ir] = buildChannelIRs({
            fill: {
                value: new Float32Array([0.25, 0.5, 0.75, 1]),
                type: "f32",
                components: 4,
                scale: { type: "identity" },
            },
        });

        expect(ir.inputComponents).toBe(4);
        expect(ir.sourceKind).toBe("literal");
        expect(ir.rawValueExpr).toBe("vec4<f32>(0.25, 0.5, 0.75, 1.0)");
    });

    it("emits exact packed u32 literals from typed subarrays", () => {
        const [ir] = buildChannelIRs({
            x: {
                value: new Uint32Array([0, 0xfedcba98, 4095, 0]).subarray(1, 3),
                type: "u32",
                components: 1,
                inputComponents: 2,
                scale: { type: "index", domain: [0, 2 ** 44], range: [0, 1] },
            },
        });

        expect(ir.rawValueExpr).toBe("vec2<u32>(u32(4275878552), u32(4095))");
    });

    it("routes dynamic values through uniforms", () => {
        const [ir] = buildChannelIRs({
            x: {
                value: 1,
                dynamic: true,
                type: "f32",
                scale: { type: "identity" },
            },
        });

        expect(ir.sourceKind).toBe("uniform");
        expect(ir.rawValueExpr).toBe("params.u_x");
    });

    it("uses a mark-specific series index expression", () => {
        const channels = {
            x: /** @type {import("../../index.d.ts").ChannelConfigResolved} */ ({
                data: new Float32Array([1]),
                type: "f32",
                components: 1,
                scale: { type: "identity" },
            }),
        };
        const compiled = compileMarkChannels({
            channels,
            analysisByChannel: analyzeTestChannels(channels),
            channelNames: new Set(["x"]),
            inputNames: new Set(),
            seriesIndexExpression: "glyphs[i].stringIndex",
        });

        expect(compiled.channelIRs[0].rawValueExpr).toBe(
            "read_x(glyphs[i].stringIndex)"
        );
    });

    it("emits numeric ordinal ranges as floating-point outputs", () => {
        const [ir] = buildChannelIRs({
            opacity: {
                data: new Uint32Array([1]),
                type: "u32",
                scale: {
                    type: "ordinal",
                    domain: [1],
                    range: [0.5],
                },
            },
        });

        expect(ir.scalarType).toBe("u32");
        expect(ir.outputScalarType).toBe("f32");
    });
});
