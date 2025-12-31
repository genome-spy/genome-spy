import { describe, expect, it } from "vitest";
import { buildChannelIRs } from "./channelIR.js";

describe("channelIR", () => {
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
                value: [0.1, 0.2, 0.3, 1],
                type: "f32",
                components: 4,
                scale: { type: "identity" },
            },
        });

        expect(ir.inputComponents).toBe(4);
        expect(ir.sourceKind).toBe("literal");
        expect(ir.rawValueExpr.startsWith("vec4<f32>(")).toBe(true);
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
});
