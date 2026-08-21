import { describe, expect, it } from "vitest";
import { buildMarkShader as buildDefinedMarkShader } from "./markShaderBuilder.js";
import RectProgram from "../programs/rectProgram.js";
import { createMockRenderer } from "../../testUtils/mockRenderer.js";
import { attachScaleDefinitions } from "../../../testUtils/scaleDefinitions.js";

/** @param {import("./markShaderBuilder.js").ShaderBuildParams} params */
function buildMarkShader(params) {
    attachScaleDefinitions(params.channels);
    return buildDefinedMarkShader(params);
}

const shaderBody = `
@vertex
fn vs_main() -> @builtin(position) vec4<f32> {
  return vec4<f32>(0.0, 0.0, 0.0, 1.0);
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
  return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}
`;

describe("buildMarkShader", () => {
    it("generates buffer bindings and accessors for series data", () => {
        const packedSeriesLayout = new Map(
            /** @type {[string, import("../programs/internal/packedSeriesLayout.js").PackedSeriesLayoutEntry][]} */ ([
                [
                    "x",
                    {
                        name: "x",
                        scalarType: "f32",
                        components: 1,
                        offset: 0,
                        stride: 1,
                    },
                ],
            ])
        );
        const { shaderCode, resourceBindings } = buildMarkShader({
            channels: {
                x: {
                    data: new Float32Array(4),
                    type: "f32",
                    components: 1,
                    scale: { type: "linear", domain: [0, 1], range: [0, 1] },
                },
            },
            uniformLayout: [
                {
                    name: "uDomain_x",
                    type: "f32",
                    components: 1,
                    arrayLength: 2,
                },
                {
                    name: "uRange_x",
                    type: "f32",
                    components: 1,
                    arrayLength: 2,
                },
                {
                    name: "uDomainMapCount_x",
                    type: "f32",
                    components: 1,
                },
            ],
            shaderBody,
            packedSeriesLayout,
        });

        expect(resourceBindings.length).toBe(1);
        expect(shaderCode).toContain("fn read_x");
        expect(shaderCode).toContain("fn getScaled_x");
        expect(shaderCode).toContain("uDomain_x");
        expect(shaderCode).toContain("uRange_x");
        expect(shaderCode).toContain("fn premultiplyAlpha(color: vec4<f32>)");
    });

    it("emits packed series accessors when layout metadata is provided", () => {
        const packedSeriesLayout = new Map(
            /** @type {[string, import("../programs/internal/packedSeriesLayout.js").PackedSeriesLayoutEntry][]} */ ([
                [
                    "x",
                    {
                        name: "x",
                        scalarType: "f32",
                        components: 1,
                        offset: 0,
                        stride: 3,
                    },
                ],
                [
                    "y",
                    {
                        name: "y",
                        scalarType: "f32",
                        components: 2,
                        offset: 1,
                        stride: 3,
                    },
                ],
            ])
        );

        const { shaderCode, resourceLayout } = buildMarkShader({
            channels: {
                x: {
                    data: new Float32Array(2),
                    type: "f32",
                    components: 1,
                    scale: { type: "identity" },
                },
                y: {
                    data: new Float32Array(4),
                    type: "f32",
                    components: 2,
                    scale: { type: "identity" },
                },
            },
            uniformLayout: [],
            shaderBody,
            packedSeriesLayout,
        });

        expect(resourceLayout).toEqual([{ name: "seriesF32", role: "series" }]);
        expect(shaderCode).toContain("var<storage, read> seriesF32");
        expect(shaderCode).toContain("fn read_x");
        expect(shaderCode).toContain("fn read_y");
        expect(shaderCode).toContain("base = 1u + i * 3u");
    });

    it("generates value accessors for value-based channels", () => {
        const { shaderCode, resourceBindings } = buildMarkShader({
            channels: {
                fill: {
                    value: [1, 0, 0, 1],
                    components: 4,
                    dynamic: true,
                },
            },
            uniformLayout: [{ name: "u_fill", type: "f32", components: 4 }],
            shaderBody,
        });

        expect(resourceBindings.length).toBe(0);
        expect(shaderCode).toContain("fn getScaled_fill");
        expect(shaderCode).toContain("u_fill: vec4<f32>");
    });

    it("inlines constants for non-dynamic values", () => {
        const { shaderCode, resourceBindings } = buildMarkShader({
            channels: {
                opacity: {
                    value: 0.75,
                    components: 1,
                },
            },
            uniformLayout: [],
            shaderBody,
        });

        expect(resourceBindings.length).toBe(0);
        expect(shaderCode).toContain("fn getScaled_opacity");
        expect(shaderCode).toContain("return 0.75");
        expect(shaderCode).not.toContain("u_opacity");
    });

    it("binds domain maps for ordinal band domains", () => {
        const packedSeriesLayout = new Map(
            /** @type {[string, import("../programs/internal/packedSeriesLayout.js").PackedSeriesLayoutEntry][]} */ ([
                [
                    "x",
                    {
                        name: "x",
                        scalarType: "u32",
                        components: 1,
                        offset: 0,
                        stride: 1,
                    },
                ],
            ])
        );
        const { shaderCode, resourceLayout } = buildMarkShader({
            channels: {
                x: {
                    data: new Uint32Array(3),
                    type: "u32",
                    components: 1,
                    scale: {
                        type: "band",
                        domain: [10, 20, 30],
                        range: [0, 1],
                    },
                },
            },
            uniformLayout: [
                {
                    name: "uDomain_x",
                    type: "f32",
                    components: 1,
                    arrayLength: 2,
                },
                {
                    name: "uRange_x",
                    type: "f32",
                    components: 1,
                    arrayLength: 2,
                },
                {
                    name: "uDomainMapCount_x",
                    type: "f32",
                    components: 1,
                },
            ],
            shaderBody,
            packedSeriesLayout,
        });

        expect(resourceLayout).toEqual([
            { name: "seriesU32", role: "series" },
            { name: "x", role: "domainMap" },
        ]);
        expect(shaderCode).toContain("hashLookup");
        expect(shaderCode).toContain("domainMap_x");
    });

    it("emits conditional encoders with selection predicates", () => {
        const packedSeriesLayout = new Map(
            /** @type {[string, import("../programs/internal/packedSeriesLayout.js").PackedSeriesLayoutEntry][]} */ ([
                [
                    "x",
                    {
                        name: "x",
                        scalarType: "f32",
                        components: 1,
                        offset: 0,
                        stride: 1,
                    },
                ],
            ])
        );

        const { shaderCode } = buildMarkShader({
            channels: {
                x: {
                    data: new Float32Array(4),
                    type: "f32",
                    components: 1,
                    scale: { type: "linear", domain: [0, 1], range: [0, 1] },
                },
                fill: {
                    value: [1, 0, 0, 1],
                    components: 4,
                    conditions: [
                        {
                            when: {
                                selection: "brush",
                                type: "interval",
                                targets: [{ input: "x" }],
                            },
                            value: [0, 1, 0, 1],
                        },
                    ],
                },
            },
            uniformLayout: [
                {
                    name: "uDomain_x",
                    type: "f32",
                    components: 1,
                    arrayLength: 2,
                },
                {
                    name: "uRange_x",
                    type: "f32",
                    components: 1,
                    arrayLength: 2,
                },
                {
                    name: "uSelection_brush_0_active",
                    type: "u32",
                    components: 1,
                },
                {
                    name: "uSelection_brush_0",
                    type: "f32",
                    components: 2,
                },
            ],
            shaderBody,
            packedSeriesLayout,
            selectionDefs: [
                {
                    name: "brush",
                    type: "interval",
                    targets: [{ input: "x", scalarType: "f32" }],
                },
            ],
        });

        expect(shaderCode).toContain("fn checkSelection_brush");
        expect(shaderCode).toContain("fn getScaled_fill_base");
        expect(shaderCode).toContain("fn getScaled_fill");
        expect(shaderCode).toContain("checkSelection_brush");
    });

    it("emits visibility predicates over scalar inputs and slots", () => {
        const packedSeriesLayout = new Map(
            /** @type {[string, import("../programs/internal/packedSeriesLayout.js").PackedSeriesLayoutEntry][]} */
            ([
                [
                    "score",
                    {
                        name: "score",
                        scalarType: "f32",
                        components: 1,
                        offset: 0,
                        stride: 1,
                    },
                ],
            ])
        );
        const { shaderCode } = buildMarkShader({
            channels: {
                score: {
                    data: new Float32Array([0, 1]),
                    type: "f32",
                    components: 1,
                },
            },
            uniformLayout: [
                { name: "u_scalar_threshold", type: "f32", components: 1 },
            ],
            shaderBody,
            packedSeriesLayout,
            channelNames: new Set(),
            inputNames: new Set(["score"]),
            scalarSlots: {
                threshold: { value: 0.5, type: "f32" },
            },
            visibleWhen: {
                any: [
                    {
                        compare: ">=",
                        left: { input: "score" },
                        right: { slot: "threshold" },
                    },
                    {
                        all: [
                            {
                                compare: "<",
                                left: { input: "score" },
                                right: { slot: "threshold" },
                            },
                        ],
                    },
                ],
            },
        });

        expect(shaderCode).toContain("fn isInstanceVisible");
        expect(shaderCode).toContain("read_score(i)");
        expect(shaderCode).toContain("params.u_scalar_threshold");
        expect(shaderCode).toContain(">=");
        expect(shaderCode).toContain("<");
    });

    it("rejects invalid visibility predicate operands", () => {
        expect(() =>
            buildMarkShader({
                channels: {
                    score: {
                        data: new Float32Array([0, 1]),
                        type: "f32",
                        components: 1,
                    },
                },
                uniformLayout: [],
                shaderBody,
                visibleWhen: {
                    compare: ">=",
                    left: { input: "score" },
                    right: { slot: "missing" },
                },
                inputNames: new Set(["score"]),
                scalarSlots: {},
            })
        ).toThrow('unknown slot "missing"');

        expect(() =>
            buildMarkShader({
                channels: {
                    score: {
                        data: new Float32Array([0, 1]),
                        type: "f32",
                        components: 1,
                    },
                },
                uniformLayout: [],
                shaderBody,
                visibleWhen: { all: [] },
                inputNames: new Set(["score"]),
            })
        ).toThrow("all nodes must not be empty");

        expect(() =>
            buildMarkShader({
                channels: {
                    score: {
                        data: new Float32Array([0, 1]),
                        type: "f32",
                        components: 1,
                    },
                },
                uniformLayout: [],
                shaderBody,
                visibleWhen: {
                    compare: ">=",
                    left: { input: "score" },
                    right: { input: "score" },
                    any: [
                        {
                            compare: ">=",
                            left: { input: "score" },
                            right: { input: "score" },
                        },
                    ],
                },
                inputNames: new Set(["score"]),
            })
        ).toThrow("exactly one of compare, selection, all, or any");

        expect(() =>
            buildMarkShader({
                channels: {
                    score: {
                        data: new Float32Array([0, 1]),
                        type: "f32",
                        components: 1,
                    },
                },
                uniformLayout: [],
                shaderBody,
                visibleWhen: {
                    any: [
                        {
                            compare: ">=",
                            left: { input: "score" },
                            right: { input: "score" },
                        },
                    ],
                    all: [
                        {
                            compare: ">=",
                            left: { input: "score" },
                            right: { input: "score" },
                        },
                    ],
                },
                inputNames: new Set(["score"]),
            })
        ).toThrow("exactly one of compare, selection, all, or any");

        expect(() =>
            buildMarkShader({
                channels: {
                    fill: { value: 0, type: "f32", components: 1 },
                },
                uniformLayout: [],
                shaderBody,
                channelNames: new Set(["fill"]),
                visibleWhen: {
                    compare: ">=",
                    left: { channel: "fill__cond0" },
                    right: { channel: "fill" },
                },
            })
        ).toThrow('unknown channel "fill__cond0"');
    });

    it("emits independent active checks and ranged hit-test formulas", () => {
        const { shaderCode } = buildMarkShader({
            channels: {
                x: { value: 2, type: "f32", components: 1 },
                x2: { value: 4, type: "f32", components: 1 },
                y: { value: 3, type: "u32", components: 1 },
                fill: {
                    value: 0,
                    type: "f32",
                    components: 1,
                    conditions: [
                        {
                            when: {
                                selection: "brush",
                                type: "interval",
                                targets: [
                                    {
                                        input: "x",
                                        secondaryInput: "x2",
                                        hitTest: "endpoints",
                                    },
                                    { input: "y" },
                                ],
                            },
                            value: 1,
                        },
                    ],
                },
            },
            uniformLayout: [
                {
                    name: "uSelection_brush_0_active",
                    type: "u32",
                    components: 1,
                },
                {
                    name: "uSelection_brush_0",
                    type: "f32",
                    components: 2,
                },
                {
                    name: "uSelection_brush_1_active",
                    type: "u32",
                    components: 1,
                },
                {
                    name: "uSelection_brush_1",
                    type: "u32",
                    components: 2,
                },
            ],
            shaderBody,
            selectionDefs: [
                {
                    name: "brush",
                    type: "interval",
                    targets: [
                        {
                            input: "x",
                            secondaryInput: "x2",
                            hitTest: "endpoints",
                        },
                        { input: "y" },
                    ],
                },
            ],
        });

        expect(shaderCode).toContain("params.uSelection_brush_0_active");
        expect(shaderCode).toContain("params.uSelection_brush_1_active");
        expect(shaderCode).toContain("matches = matches && allowEmpty");
        expect(shaderCode).toContain("uSelection_brush_0_d0");
        expect(shaderCode).toContain("uSelection_brush_0_d1");
        expect(shaderCode).toContain("uSelection_brush_1_lo");
    });

    it("throws when updating non-dynamic uniforms", () => {
        const renderer = createMockRenderer();
        const program = new RectProgram(renderer, {
            count: 1,
            channels: {
                x: { value: 0, dynamic: true, scale: { type: "identity" } },
                x2: { value: 1, dynamic: true, scale: { type: "identity" } },
                y: { value: 0, dynamic: true, scale: { type: "identity" } },
                y2: { value: 1, dynamic: true, scale: { type: "identity" } },
                fillOpacity: { value: 1.0 },
            },
        });

        expect(() => program.updateValues({ fillOpacity: 0.5 })).toThrow(
            /u_fillOpacity/
        );
    });
});
