import { describe, expect, test } from "vitest";
import { scale } from "vega-scale";
import {
    generateConditionalEncoderGlsl,
    generateScaleGlsl,
} from "./glslScaleGenerator.js";

test("ordinal expression ranges use a texture beyond four entries", () => {
    const values = [0.1, 0.2, 0.3, 0.4, 0.5];
    const ordinal = Object.assign(
        scale("ordinal")().domain(["A", "B", "C", "D", "E"]).range(values),
        { props: { range: values.map((value) => ({ expr: String(value) })) } }
    );
    const result = generateScaleGlsl("fillOpacity", ordinal, {
        field: "group",
        type: "nominal",
    });
    expect(result.rangeUniform).toBeUndefined();
    expect(result.glsl).toContain(
        "uniform sampler2D uRangeTexture_fillOpacity"
    );
    expect(result.glsl).toContain("getDiscreteColor(uRangeTexture_fillOpacity");
});

test("continuous expression ranges retain their numeric uniform", () => {
    const linear = Object.assign(scale("linear")().range([0.1, 0.8]), {
        props: { range: [{ expr: "low" }, { expr: "high" }] },
    });
    const result = generateScaleGlsl("fillOpacity", linear, {
        field: "value",
        type: "quantitative",
    });
    expect(result.rangeUniform).toContain("uniform vec2 range_fillOpacity");
    expect(result.glsl).not.toContain("uRangeTexture_fillOpacity");
});

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

describe("index gap specialization", () => {
    test.each([
        { gapPositions: [10], gapWidth: 0 },
        { gapPositions: [10], gapWidth: null },
        { gapPositions: [], gapWidth: { expr: "width" } },
        { gapPositions: null, gapWidth: 6 },
        { gapPositions: { expr: "cuts" }, gapWidth: 0 },
    ])(
        "omits gap helpers and uniforms for statically disabled %j",
        async (props) => {
            const { default: scaleIndex } =
                await import("../../../genome/scaleIndex.js");
            const { generateScaleGlsl } =
                await import("./glslScaleGenerator.js");
            const scale = Object.assign(scaleIndex().domain([0, 20]), {
                type: "index",
                props,
            });
            const result = generateScaleGlsl("x", scale, {
                field: "index",
                type: "index",
            });
            expect(JSON.stringify(result)).not.toMatch(/Gap|gapRank|scaleGaps/);
        }
    );
});
