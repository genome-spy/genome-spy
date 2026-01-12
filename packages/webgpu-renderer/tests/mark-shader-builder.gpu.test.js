/*
 * GPU tests for markShaderBuilder output. These compile the generated WGSL,
 * execute a compute pass that calls `getScaled_*`, and read back the results
 * to validate channel wiring, scale application, and selection predicates.
 */

import { test, expect } from "@playwright/test";
import { color as d3color } from "d3-color";
import { interpolateHcl } from "d3-interpolate";
import { scaleLinear } from "d3-scale";
import { createSchemeTexture } from "../src/utils/colorUtils.js";
import {
    buildHashTableMap,
    buildHashTableSet,
} from "../src/utils/hashTable.js";
import { ensureWebGPU, packTextureData } from "./gpuTestUtils.js";
import { runScaleCase } from "./scaleShaderTestUtils.js";
import { SELECTION_BUFFER_PREFIX } from "../src/wgsl/prefixes.js";

globalThis.GPUShaderStage ??= {
    VERTEX: 0x1,
    FRAGMENT: 0x2,
    COMPUTE: 0x4,
};

test("markShaderBuilder executes series-backed scales in a compute pass", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const dumpLabel = test.info().title;

    const input = [0, 0.5, 1];
    const domain = [0, 1];
    const range = [0, 10];
    const reference = scaleLinear().domain(domain).range(range);

    const channels = {
        x: {
            data: new Float32Array(input),
            type: "f32",
            components: 1,
            scale: { type: "linear", domain, range },
        },
    };
    const uniformLayout = [
        { name: "uDomain_x", type: "f32", components: 1, arrayLength: 2 },
        { name: "uRange_x", type: "f32", components: 1, arrayLength: 2 },
    ];
    const output = await runScaleCase(page, {
        channels,
        channelName: "x",
        outputType: "f32",
        outputLength: input.length,
        outputComponents: 1,
        uniformLayout,
        uniforms: {
            uDomain_x: domain,
            uRange_x: range,
        },
        dumpLabel,
    });

    expect(output).toHaveLength(input.length);
    input.forEach((value, index) => {
        expect(output[index]).toBeCloseTo(reference(value), 5);
    });
});

test("markShaderBuilder passes through identity values for series data", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const dumpLabel = test.info().title;

    const input = [0.1, 0.2, 0.3, 0.4];
    const channels = {
        x: {
            data: new Float32Array(input),
            type: "f32",
            components: 1,
        },
    };
    const output = await runScaleCase(page, {
        channels,
        channelName: "x",
        outputType: "f32",
        outputLength: input.length,
        outputComponents: 1,
        dumpLabel,
    });

    expect(output).toHaveLength(input.length);
    input.forEach((value, index) => {
        expect(output[index]).toBeCloseTo(value, 5);
    });
});

test("markShaderBuilder reads dynamic value uniforms", async ({ page }) => {
    await ensureWebGPU(page);
    const dumpLabel = test.info().title;

    const value = 0.75;
    const channels = {
        opacity: {
            value,
            dynamic: true,
            components: 1,
            scale: { type: "identity" },
        },
    };
    const uniformLayout = [{ name: "u_opacity", type: "f32", components: 1 }];
    const output = await runScaleCase(page, {
        channels,
        channelName: "opacity",
        outputType: "f32",
        outputLength: 1,
        outputComponents: 1,
        uniformLayout,
        uniforms: { u_opacity: value },
        dumpLabel,
    });

    expect(output).toEqual([value]);
});

test("markShaderBuilder applies threshold scales to value channels", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const dumpLabel = test.info().title;

    const channels = {
        fill: {
            value: 0.5,
            type: "f32",
            components: 4,
            scale: {
                type: "threshold",
                domain: [0],
                range: [
                    [0, 0, 0, 1],
                    [1, 0, 0, 1],
                ],
            },
        },
    };
    const uniformLayout = [
        { name: "uDomain_fill", type: "f32", components: 1, arrayLength: 1 },
        { name: "uRange_fill", type: "f32", components: 4, arrayLength: 2 },
    ];
    const output = await runScaleCase(page, {
        channels,
        channelName: "fill",
        outputType: "vec4<f32>",
        outputLength: 1,
        outputComponents: 4,
        uniformLayout,
        uniforms: {
            uDomain_fill: [0],
            uRange_fill: [
                [0, 0, 0, 1],
                [1, 0, 0, 1],
            ],
        },
        dumpLabel,
    });

    expect(output).toHaveLength(4);
    expect(output[0]).toBeCloseTo(1, 5);
    expect(output[1]).toBeCloseTo(0, 5);
    expect(output[2]).toBeCloseTo(0, 5);
    expect(output[3]).toBeCloseTo(1, 5);
});

test("markShaderBuilder applies ordinal scales to value channels", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const dumpLabel = test.info().title;

    const channels = {
        shape: {
            value: 0,
            type: "u32",
            components: 4,
            scale: { type: "ordinal", range: [0, 1] },
        },
    };
    const uniformLayout = [
        { name: "uRangeCount_shape", type: "f32", components: 1 },
        { name: "uDomainMapCount_shape", type: "f32", components: 1 },
    ];
    const rangeData = [0, 0, 1, 1, 1, 0, 0, 1];
    const output = await runScaleCase(page, {
        channels,
        channelName: "shape",
        outputType: "vec4<f32>",
        outputLength: 1,
        outputComponents: 4,
        uniformLayout,
        uniforms: {
            uRangeCount_shape: 2,
            uDomainMapCount_shape: 0,
        },
        extraBuffers: [
            { name: "shape", role: "ordinalRange", data: rangeData },
            { name: "shape", role: "domainMap", data: [0, 0] },
        ],
        dumpLabel,
    });

    expect(output).toHaveLength(4);
    expect(output[0]).toBeCloseTo(0, 5);
    expect(output[1]).toBeCloseTo(0, 5);
    expect(output[2]).toBeCloseTo(1, 5);
    expect(output[3]).toBeCloseTo(1, 5);
});

test("markShaderBuilder applies ordinal scales with sparse domain maps", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const dumpLabel = test.info().title;

    const channels = {
        shape: {
            value: 42,
            type: "u32",
            components: 4,
            scale: {
                type: "ordinal",
                domain: [10, 42, 99],
                range: [
                    [0, 0, 0, 1],
                    [1, 0, 0, 1],
                    [0, 1, 0, 1],
                ],
            },
        },
    };
    const uniformLayout = [
        { name: "uRangeCount_shape", type: "f32", components: 1 },
        { name: "uDomainMapCount_shape", type: "f32", components: 1 },
    ];
    const domainMap = buildHashTableMap([
        [10, 0],
        [42, 1],
        [99, 2],
    ]);
    const rangeData = [0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1];
    const output = await runScaleCase(page, {
        channels,
        channelName: "shape",
        outputType: "vec4<f32>",
        outputLength: 1,
        outputComponents: 4,
        uniformLayout,
        uniforms: {
            uRangeCount_shape: 3,
            uDomainMapCount_shape: domainMap.size,
        },
        extraBuffers: [
            { name: "shape", role: "ordinalRange", data: rangeData },
            { name: "shape", role: "domainMap", data: domainMap.table },
        ],
        dumpLabel,
    });

    expect(output).toHaveLength(4);
    expect(output[0]).toBeCloseTo(1, 5);
    expect(output[1]).toBeCloseTo(0, 5);
    expect(output[2]).toBeCloseTo(0, 5);
    expect(output[3]).toBeCloseTo(1, 5);
});

test("markShaderBuilder returns zero for missing ordinal categories", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const dumpLabel = test.info().title;

    const input = [1, 99];
    const inputData = new Uint32Array(input);
    const domainMap = buildHashTableMap([[1, 0]]);
    const rangeData = [0, 1, 0, 1];

    const channels = {
        fill: {
            data: new Uint32Array(input),
            type: "u32",
            components: 4,
            inputComponents: 1,
            scale: {
                type: "ordinal",
                domain: [1],
                range: [[0, 1, 0, 1]],
            },
        },
    };
    const uniformLayout = [
        { name: "uRangeCount_fill", type: "f32", components: 1 },
        { name: "uDomainMapCount_fill", type: "f32", components: 1 },
    ];
    const output = await runScaleCase(page, {
        channels,
        channelName: "fill",
        outputType: "vec4<f32>",
        outputLength: input.length,
        outputComponents: 4,
        uniformLayout,
        uniforms: {
            uRangeCount_fill: 1,
            uDomainMapCount_fill: domainMap.size,
        },
        extraBuffers: [
            { name: "fill", role: "ordinalRange", data: rangeData },
            { name: "fill", role: "domainMap", data: domainMap.table },
        ],
        dumpLabel,
    });

    expect(output).toHaveLength(input.length * 4);
    expect(output.slice(0, 4)).toEqual([0, 1, 0, 1]);
    expect(output.slice(4, 8)).toEqual([0, 0, 0, 0]);
});

test("markShaderBuilder samples range textures for vec4 output", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const dumpLabel = test.info().title;

    const input = [0, 0.5, 1];
    const domain = [0, 1];
    const unitRange = [0, 1];
    const interpolator = interpolateHcl("green", "red");
    const reference = scaleLinear()
        .domain(domain)
        .range(["green", "red"])
        .interpolate(interpolateHcl);
    const textureData = createSchemeTexture(interpolator, 256);
    if (!textureData) {
        throw new Error("Failed to create range texture.");
    }

    const channels = {
        fill: {
            data: new Float32Array(input),
            type: "f32",
            components: 4,
            inputComponents: 1,
            scale: { type: "linear", domain, range: interpolator },
        },
    };
    const uniformLayout = [
        { name: "uDomain_fill", type: "f32", components: 1, arrayLength: 2 },
        { name: "uRange_fill", type: "f32", components: 1, arrayLength: 2 },
    ];
    const output = await runScaleCase(page, {
        channels,
        channelName: "fill",
        outputType: "vec4<f32>",
        outputLength: input.length,
        outputComponents: 4,
        uniformLayout,
        uniforms: {
            uDomain_fill: domain,
            uRange_fill: unitRange,
        },
        texture: { name: "fill", texture: packTextureData(textureData) },
        dumpLabel,
    });

    expect(output).toHaveLength(input.length * 4);
    input.forEach((value, index) => {
        const expected = d3color(reference(value)).rgb();
        const base = index * 4;
        expect(output[base]).toBeCloseTo(expected.r / 255, 2);
        expect(output[base + 1]).toBeCloseTo(expected.g / 255, 2);
        expect(output[base + 2]).toBeCloseTo(expected.b / 255, 2);
        expect(output[base + 3]).toBeCloseTo(1, 5);
    });
});

test("markShaderBuilder clamps range texture sampling to endpoints", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const dumpLabel = test.info().title;

    const input = [-0.2, 0, 1, 1.2];
    const domain = [0, 1];
    const unitRange = [0, 1];
    const interpolator = interpolateHcl("green", "red");
    const reference = scaleLinear()
        .domain(domain)
        .range(["green", "red"])
        .interpolate(interpolateHcl);
    const textureData = createSchemeTexture(interpolator, 256);
    if (!textureData) {
        throw new Error("Failed to create range texture.");
    }

    const channels = {
        fill: {
            data: new Float32Array(input),
            type: "f32",
            components: 4,
            inputComponents: 1,
            scale: { type: "linear", domain, range: interpolator, clamp: true },
        },
    };
    const uniformLayout = [
        { name: "uDomain_fill", type: "f32", components: 1, arrayLength: 2 },
        { name: "uRange_fill", type: "f32", components: 1, arrayLength: 2 },
    ];
    const output = await runScaleCase(page, {
        channels,
        channelName: "fill",
        outputType: "vec4<f32>",
        outputLength: input.length,
        outputComponents: 4,
        uniformLayout,
        uniforms: {
            uDomain_fill: domain,
            uRange_fill: unitRange,
        },
        texture: { name: "fill", texture: packTextureData(textureData) },
        dumpLabel,
    });

    const expectedColors = [
        reference(0),
        reference(0),
        reference(1),
        reference(1),
    ].map((value) => d3color(value).rgb());

    expect(output).toHaveLength(input.length * 4);
    expectedColors.forEach((expected, index) => {
        const base = index * 4;
        expect(output[base]).toBeCloseTo(expected.r / 255, 2);
        expect(output[base + 1]).toBeCloseTo(expected.g / 255, 2);
        expect(output[base + 2]).toBeCloseTo(expected.b / 255, 2);
        expect(output[base + 3]).toBeCloseTo(1, 5);
    });
});

test("markShaderBuilder applies interval selections to conditional values", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const dumpLabel = test.info().title;

    const input = new Float32Array([0, 1, 2, 3]);
    const channels = {
        x: {
            data: input,
            type: "f32",
            components: 1,
        },
        fill: {
            value: 0,
            type: "f32",
            components: 1,
            conditions: [
                {
                    when: {
                        selection: "brush",
                        type: "interval",
                        channel: "x",
                    },
                    value: 1,
                },
            ],
        },
    };
    const uniformLayout = [
        { name: "uSelection_brush", type: "f32", components: 2 },
    ];
    const selectionDefs = [
        {
            name: "brush",
            type: "interval",
            channel: "x",
            scalarType: "f32",
        },
    ];
    const output = await runScaleCase(page, {
        channels,
        channelName: "fill",
        outputType: "f32",
        outputLength: input.length,
        outputComponents: 1,
        uniformLayout,
        uniforms: { uSelection_brush: [1, 2] },
        selectionDefs,
        dumpLabel,
    });

    expect(output).toEqual([0, 1, 1, 0]);
});

test("markShaderBuilder applies single selections to conditional values", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const dumpLabel = test.info().title;

    const ids = new Uint32Array([10, 11, 12, 13]);
    const channels = {
        uniqueId: {
            data: ids,
            type: "u32",
            components: 1,
        },
        fill: {
            value: 0,
            type: "f32",
            components: 1,
            conditions: [
                {
                    when: {
                        selection: "picked",
                        type: "single",
                    },
                    value: 1,
                },
            ],
        },
    };
    const uniformLayout = [
        { name: "uSelection_picked", type: "u32", components: 1 },
    ];
    const selectionDefs = [{ name: "picked", type: "single" }];
    const output = await runScaleCase(page, {
        channels,
        channelName: "fill",
        outputType: "f32",
        outputLength: ids.length,
        outputComponents: 1,
        uniformLayout,
        uniforms: { uSelection_picked: 12 },
        selectionDefs,
        dumpLabel,
    });

    expect(output).toEqual([0, 0, 1, 0]);
});

test("markShaderBuilder applies interval selections over ranged channels", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const dumpLabel = test.info().title;

    const x = new Float32Array([0, 1, 2, 3]);
    const x2 = new Float32Array([1, 2, 3, 4]);
    const channels = {
        x: {
            data: x,
            type: "f32",
            components: 1,
        },
        x2: {
            data: x2,
            type: "f32",
            components: 1,
        },
        fill: {
            value: 0,
            type: "f32",
            components: 1,
            conditions: [
                {
                    when: {
                        selection: "span",
                        type: "interval",
                        channel: "x",
                        secondaryChannel: "x2",
                    },
                    value: 1,
                },
            ],
        },
    };
    const uniformLayout = [
        { name: "uSelection_span", type: "f32", components: 2 },
    ];
    const selectionDefs = [
        {
            name: "span",
            type: "interval",
            channel: "x",
            secondaryChannel: "x2",
            scalarType: "f32",
        },
    ];
    const output = await runScaleCase(page, {
        channels,
        channelName: "fill",
        outputType: "f32",
        outputLength: x.length,
        outputComponents: 1,
        uniformLayout,
        uniforms: { uSelection_span: [2.5, 4.5] },
        selectionDefs,
        dumpLabel,
    });

    expect(output).toEqual([0, 0, 1, 1]);
});

test("markShaderBuilder applies multi selections via hash tables", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const dumpLabel = test.info().title;

    const ids = new Uint32Array([10, 11, 12, 13]);
    const channels = {
        uniqueId: {
            data: ids,
            type: "u32",
            components: 1,
        },
        fill: {
            value: 0,
            type: "f32",
            components: 1,
            conditions: [
                {
                    when: {
                        selection: "picked",
                        type: "multi",
                    },
                    value: 1,
                },
            ],
        },
    };
    const uniformLayout = [
        { name: "uSelectionCount_picked", type: "u32", components: 1 },
    ];
    const selectionDefs = [{ name: "picked", type: "multi" }];
    const selectionBufferName = SELECTION_BUFFER_PREFIX + "picked";
    const extraResources = [
        {
            name: selectionBufferName,
            kind: "buffer",
            role: "extraBuffer",
            wgslName: selectionBufferName,
            wgslType: "array<HashEntry>",
            bufferType: "read-only-storage",
            visibility: "vertex",
        },
    ];
    const { table, size } = buildHashTableSet([11, 13]);
    const output = await runScaleCase(page, {
        channels,
        channelName: "fill",
        outputType: "f32",
        outputLength: ids.length,
        outputComponents: 1,
        uniformLayout,
        uniforms: { uSelectionCount_picked: size },
        selectionDefs,
        extraResources,
        extraBuffers: [{ name: selectionBufferName, data: table }],
        dumpLabel,
    });

    expect(output).toEqual([0, 1, 0, 1]);
});
