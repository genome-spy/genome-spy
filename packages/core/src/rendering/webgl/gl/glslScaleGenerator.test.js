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
                        any: [
                            { param: "selected", type: "single", empty: false },
                            { param: "brush", type: "interval", empty: false },
                            {
                                not: {
                                    any: [
                                        {
                                            selectionActive: {
                                                param: "selected",
                                                type: "single",
                                                components: [],
                                            },
                                        },
                                        {
                                            selectionActive: {
                                                param: "brush",
                                                type: "interval",
                                                components: ["x"],
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
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
        expect(source).toContain("(!(");
    });
});
