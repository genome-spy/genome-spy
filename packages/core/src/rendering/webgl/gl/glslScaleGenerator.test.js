import { describe, expect, test } from "vitest";
import { generateConditionalEncoderGlsl } from "./glslScaleGenerator.js";

describe("GLSL conditional selection encoders", () => {
    test("emit union membership and group emptiness checks", () => {
        const branches = /** @type {any} */ ([
            {
                accessor: {
                    channelDef: { value: "blue" },
                    scaleChannel: undefined,
                },
                predicate: {
                    selection: {
                        params: ["selected", "brush"],
                        empty: true,
                        legacy: false,
                    },
                },
            },
            {
                accessor: {
                    channelDef: { value: "gray" },
                    scaleChannel: undefined,
                },
                predicate: {},
            },
        ]);

        const source = generateConditionalEncoderGlsl("color", branches);
        expect(source).toContain("isSelectionMember_selected()");
        expect(source).toContain("isSelectionMember_brush()");
        expect(source).toContain("isSelectionEmpty_selected()");
        expect(source).toContain("isSelectionEmpty_brush()");
        expect(source).toContain("|| (isSelectionEmpty_selected() &&");
    });
});
