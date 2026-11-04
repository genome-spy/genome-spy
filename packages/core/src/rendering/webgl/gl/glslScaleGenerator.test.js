import { describe, expect, onTestFinished, test } from "vitest";
import { scaleOrdinal, scaleLinear } from "d3-scale";
import { createHeadlessEngine } from "../../../genomeSpy/headlessBootstrap.js";
import {
    generateConditionalEncoderGlsl,
    generateScaleGlsl,
    generateConstantValueGlsl,
    generateDynamicValueGlslAndUniform,
    getRangeForGlsl,
} from "./glslScaleGenerator.js";

test("ordinal expression ranges use a texture beyond four entries", () => {
    const values = [0.1, 0.2, 0.3, 0.4, 0.5];
    const ordinal = Object.assign(
        scaleOrdinal().domain(["A", "B", "C", "D", "E"]).range(values),
        {
            type: "ordinal",
            props: { range: values.map((value) => ({ expr: String(value) })) },
        }
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
    const linear = Object.assign(scaleLinear().range([0.1, 0.8]), {
        type: "linear",
        props: { range: [{ expr: "low" }, { expr: "high" }] },
    });
    const result = generateScaleGlsl("fillOpacity", linear, {
        field: "value",
        type: "quantitative",
    });
    expect(result.rangeUniform).toContain("uniform vec2 range_fillOpacity");
    expect(result.glsl).not.toContain("uRangeTexture_fillOpacity");
});

test.each(/** @type {const} */ (["band", "point"]))(
    "positional %s shaders retain numeric range commands through the live uniform contract",
    async (type) => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ category: "A" }, { category: "B" }] },
            scales: {
                y: {
                    type,
                    domain: ["A", "B"],
                    reverse: true,
                    gapPositions: ["B"],
                    gapWidth: 8,
                },
            },
            mark: "point",
            encoding: {
                y: { field: "category", type: "nominal", axis: null },
            },
        });
        onTestFinished(() => view.disposeSubtree());
        const resolution = view.getScaleResolution("y");
        const scale = resolution.getScale();
        const shader = generateScaleGlsl("y", scale, {
            field: "category",
            type: "nominal",
        });
        expect(shader.rangeUniform).toContain("uniform vec2 range_y");
        expect(shader.glsl).not.toContain("const vec2 range_y");
        // The whole placed height is the divisor, even for a pane taller than its owner.
        expect(shader.glsl).toContain(
            "geometry.x / (uViewportSize.y * getSampleFacetPos().height)"
        );

        // WebGL's existing range listener reads this payload for the uniform.
        const payloads = [getRangeForGlsl(scale, "y")];
        resolution.addEventListener("range", () =>
            payloads.push(getRangeForGlsl(scale, "y"))
        );
        scale.range([0.9, -0.8]);
        await view.paramRuntime.whenPropagated();
        expect(payloads).toEqual([
            [1, 0],
            [0.9, -0.8],
        ]);

        const secondary = generateScaleGlsl("y2", scale, {
            field: "category",
        });
        expect(secondary.rangeUniform).toBeUndefined();
        expect(secondary.rangeUniformName).toBe(shader.rangeUniformName);
    }
);

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

test("prepares finite RGBA constants and expression uniforms", () => {
    const literal = generateConstantValueGlsl("fill", 0, "transparent");
    expect(literal.accessorGlsl).toContain("vec4(0.0, 0.0, 0.0, 0.0)");
    const dynamic = generateDynamicValueGlslAndUniform("stroke", 0);
    expect(dynamic.uniformGlsl).toContain("uniform vec4");
    expect(dynamic.adjuster(null)).toEqual([0, 0, 0, 0]);
    expect(dynamic.adjuster("transparent")).toEqual([0, 0, 0, 0]);
    expect(() => dynamic.adjuster(undefined)).toThrow("Invalid color");
    expect(() => dynamic.adjuster("invalid")).toThrow("Invalid color");
    expect(dynamic.adjuster("rgba(255,0,0,0.5)")).toEqual([1, 0, 0, 0.5]);
});
