// @ts-expect-error Node types are intentionally absent from the browser package.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { createTrueTypeFont } from "../../fonts/trueTypeFont.js";
import { createMockRenderer } from "../../testUtils/mockRenderer.js";
import { identityScale } from "../../scales/identity.js";
import { indexScale } from "../../scales/index.js";
import { thresholdScale } from "../../scales/threshold.js";
import TextProgram from "./textProgram.js";

const TEST_FONT = createTrueTypeFont(
    readFileSync(new URL("../../fonts/DefaultFont.ttf", import.meta.url))
);

class TestTextProgram extends TextProgram {
    /** @param {any} layout @param {any} font */
    _initializeOutlineFontResources(layout, font) {
        const texture = this.device.createTexture({
            size: [128, 128],
            format: "rgba16float",
            usage: GPUTextureUsage.TEXTURE_BINDING,
        });
        const atlas = {
            texture,
            sampler: this.device.createSampler(),
            width: 128,
            height: 128,
            ensure: (/** @type {any[]} */ glyphs) =>
                glyphs.map((/** @type {any} */ glyph) => ({
                    x: 0.5,
                    y: 0.5,
                    width: glyph.tileWidth - 1,
                    height: glyph.tileHeight - 1,
                })),
            subscribe: () => () => {},
        };
        this._outlineAtlas = /** @type {any} */ (atlas);
        this._updateOutlineGlyphMetrics(
            layout,
            font,
            /** @type {any} */ (atlas)
        );
        this._extraTextures.set("fontAtlas", {
            texture,
            sampler: atlas.sampler,
            width: atlas.width,
            height: atlas.height,
            format: "rgba16float",
        });
        this._borrowedExtraTextures.add("fontAtlas");
        this._sdfNumeratorBase = 28;
    }
}

/** @param {import("../../renderer.js").Renderer} renderer @param {any} config */
function createTextProgram(renderer, config) {
    return new TestTextProgram(renderer, { ...config, font: TEST_FONT });
}

describe("TextProgram series replacement", () => {
    it("keeps effect-free text on the direct glyph path", () => {
        const getShaderBody = Object.getOwnPropertyDescriptor(
            TextProgram.prototype,
            "shaderBody"
        ).get;
        const shaderBody = getShaderBody.call({});
        const resourceDefs = TextProgram.prototype.getExtraResourceDefs.call({
            _markConfig: {
                effects: { enabled: false, shadow: false, outline: false },
            },
        });

        expect(shaderBody).toContain("let glyph = glyphs[i];");
        expect(shaderBody).not.toContain("let renderItem = renderItems[i];");
        expect(
            resourceDefs.map(
                (/** @type {{ name: string }} */ definition) => definition.name
            )
        ).not.toContain("renderItems");
    });

    it("compiles effect text with render-item indirection", () => {
        const getShaderBody = Object.getOwnPropertyDescriptor(
            TextProgram.prototype,
            "shaderBody"
        ).get;
        const context = {
            _markConfig: {
                effects: { enabled: true, shadow: true, outline: true },
            },
        };
        const shaderBody = getShaderBody.call(context);
        const resourceDefs =
            TextProgram.prototype.getExtraResourceDefs.call(context);

        expect(shaderBody).toContain("let renderItem = renderItems[i];");
        expect(shaderBody).toContain("sampleTrueDistance(uv)");
        expect(shaderBody).toContain("in.layer == TEXT_LAYER_SHADOW");
        expect(
            resourceDefs.map(
                (/** @type {{ name: string }} */ definition) => definition.name
            )
        ).toContain("renderItems");
    });

    it("rejects text without an outline font", () => {
        expect(
            () =>
                new TextProgram(createMockRenderer(), {
                    channels: {
                        text: { value: "x" },
                        x: { value: 0, scale: identityScale() },
                        y: { value: 0, scale: identityScale() },
                        strokeWidth: { value: 1 },
                    },
                })
        ).toThrow("require a TrueType outline font");
    });

    it("fits ranged text after applying facet placement", () => {
        const shaderBody = Object.getOwnPropertyDescriptor(
            TextProgram.prototype,
            "shaderBody"
        ).get.call({});

        // Faceted text must use the placed sample-row range for fitting, like
        // the WebGL text mark.
        expect(
            shaderBody.indexOf("let xRange = positionInsideRange")
        ).toBeLessThan(
            shaderBody.indexOf("anchor = params.uViewport.xy + anchor")
        );
        expect(shaderBody).toContain(
            "var anchor = applyPlacementPixel(anchorPosition, i) + positionOffset"
        );
        expect(shaderBody).toContain(
            "getScaled_xOffset(i),\n        getScaled_yOffset(i)"
        );
        expect(shaderBody).toContain(
            "let angle = angleDegrees * 3.14159265 / 180.0"
        );
        expect(shaderBody).toContain(
            "x + local.x * width + getScaled_dx(i),\n        y + getScaled_dy(i)"
        );
        expect(shaderBody).toContain(
            "maxValue(params.uViewportEdgeFadeDistance) > -1e10"
        );
        expect(shaderBody).toContain(
            "return shadeBase(in, clamp(in.edgeFadeOpacity, 0.0, 1.0));"
        );
        expect(shaderBody).toContain(
            "let localPixel = localAnchor + rotated + effectOffset;\n    let pixel = anchor + rotated + effectOffset"
        );
        expect(shaderBody).toContain(
            "let localUnit = localPixel / viewportSize;"
        );
        expect(shaderBody).toContain(
            "vec4<f32>(-1.0, -1.0, 1.0, 1.0) * localUnit.yxyx"
        );
        expect(shaderBody).toContain(
            "fn shade(in: VSOut) -> vec4<f32> {\n    return shadeBase(in, 1.0);"
        );
        expect(shaderBody).toContain("let coverage = sampleSuperOutline(");
        expect(shaderBody).toContain(
            "coverage.x,\n            getGammaForColor(fillColor.rgb)"
        );
        expect(shaderBody).toContain(
            "coverage.y,\n            getGammaForColor(strokeColor.rgb)"
        );
        expect(shaderBody).toContain("fn freeTypeLikeStemDarkening");
        expect(shaderBody).toContain(
            "let estimatedStemWidth = deviceFontSize * 0.075;"
        );
        expect(shaderBody).toContain(
            "out.stemDarkening = freeTypeLikeStemDarkening(size * globals.dpr);"
        );
        expect(shaderBody).toContain("in.stemDarkening");
        expect(shaderBody).not.toContain("uOutlineFont");
    });

    it("updates coupled text uniforms through semantic properties", () => {
        const renderer = createMockRenderer();
        const program = createTextProgram(renderer, {
            channels: {
                text: { value: "x" },
                x: { value: 0, scale: identityScale() },
                y: { value: 0, scale: identityScale() },
            },
        });
        const writeBuffer = vi.spyOn(renderer.device.queue, "writeBuffer");
        const properties = program.getSlotHandles().properties;

        properties.logoLetters.set(true);

        expect(readUniform(program, "uLogoLetters", "u32")).toBe(1);
        expect(readUniform(program, "uSdfNumerator", "f32")).toBeCloseTo(
            program._sdfNumeratorBase * 0.5
        );
        expect(writeBuffer).toHaveBeenCalledOnce();
    });

    it("updates viewport edge fade vectors through semantic properties", () => {
        const program = createTextProgram(createMockRenderer(), {
            viewportEdgeFadeWidth: [1, 2, 3, 4],
            viewportEdgeFadeDistance: [-5, -6, -7, -8],
            channels: {
                text: { value: "x" },
                x: { value: 0, scale: identityScale() },
                y: { value: 0, scale: identityScale() },
            },
        });
        const properties = program.getSlotHandles().properties;

        expect(readUniformVector(program, "uViewportEdgeFadeWidth")).toEqual([
            1, 2, 3, 4,
        ]);
        expect(readUniformVector(program, "uViewportEdgeFadeDistance")).toEqual(
            [-5, -6, -7, -8]
        );

        properties.viewportEdgeFadeWidth.set([4, 3, 2, 1]);

        expect(readUniformVector(program, "uViewportEdgeFadeWidth")).toEqual([
            4, 3, 2, 1,
        ]);
    });

    it("rebuilds glyph layout from logical strings without recreating the pipeline", () => {
        const renderer = createMockRenderer();
        const program = createTextProgram(renderer, {
            count: 2,
            channels: {
                text: { data: ["0", "0"] },
                x: {
                    data: new Float32Array([0, 0]),
                    type: "f32",
                    scale: identityScale(),
                },
                y: {
                    data: new Float32Array([5, 6]),
                    type: "f32",
                    scale: identityScale(),
                },
            },
        });
        const pipeline = program._pipeline;
        const fontAtlas = program._extraTextures.get("fontAtlas")?.texture;

        program.getSlotHandles().series.replace({
            text: ["-1", "2"],
            x: new Float32Array([10, 20]),
            y: new Float32Array([30, 40]),
        });

        expect(program.count).toBe(2);
        expect(program._drawOffsets).toEqual(new Uint32Array([0, 2, 3]));
        expect(program._channels.x.data).toEqual(new Float32Array([10, 20]));
        expect(program._channels.y.data).toEqual(new Float32Array([30, 40]));
        expect(program._pipeline).toBe(pipeline);
        expect(program._extraTextures.get("fontAtlas")?.texture).toBe(
            fontAtlas
        );
    });

    it("rebuilds its bind group only when text layout buffers grow", () => {
        const renderer = createMockRenderer();
        const program = createTextProgram(renderer, {
            count: 2,
            channels: {
                text: { data: ["aa", "bb"] },
                x: {
                    data: new Float32Array([0, 1]),
                    type: "f32",
                    scale: identityScale(),
                },
                y: { value: 0, scale: identityScale() },
            },
        });
        const createBindGroup = vi.spyOn(renderer.device, "createBindGroup");
        const series = program.getSlotHandles().series;

        series.replace({
            text: ["a", "b"],
            x: new Float32Array([2, 3]),
        });
        expect(createBindGroup).not.toHaveBeenCalled();

        series.replace({
            text: ["aaaa", "bbbb"],
            x: new Float32Array([4, 5]),
        });
        expect(createBindGroup).toHaveBeenCalledOnce();
    });

    it("requires a count when replacing scalar text", () => {
        const program = createTextProgram(createMockRenderer(), {
            count: 1,
            channels: {
                text: { value: "x" },
                x: { value: 0, scale: identityScale() },
                y: { value: 0, scale: identityScale() },
            },
        });

        expect(() =>
            program.getSlotHandles().series.replace({ text: "y" })
        ).toThrow("Replacing a scalar text series requires an explicit count.");

        program.getSlotHandles().series.replace({ text: "y" }, 2);
        expect(program.drawCount).toBe(2);
        expect(program._drawOffsets).toEqual(new Uint32Array([0, 1, 2]));
    });

    it("preserves aliases between logical per-string arrays", () => {
        const shared = new Float32Array([1, 2]);
        const program = createTextProgram(createMockRenderer(), {
            count: 2,
            channels: {
                text: { data: ["aa", "b"] },
                x: { data: shared, type: "f32", scale: identityScale() },
                y: { data: shared, type: "f32", scale: identityScale() },
            },
        });

        expect(program._channels.x.data).toBe(program._channels.y.data);

        const next = new Float32Array([10, 20]);
        program.getSlotHandles().series.replace({
            text: ["ccc", "d"],
            x: next,
            y: next,
        });

        expect(program._channels.x.data).toBe(program._channels.y.data);
        expect(program._channels.x.data).toEqual(new Float32Array([10, 20]));
    });

    it("keeps and replaces per-string placement indices", () => {
        const program = createTextProgram(createMockRenderer(), {
            count: 2,
            placementIndex: {
                data: new Uint32Array([5, 8]),
                type: "u32",
            },
            channels: {
                text: { data: ["aa", "b"] },
                x: {
                    data: new Float32Array([1, 2]),
                    type: "f32",
                    scale: identityScale(),
                },
                y: { value: 0, scale: identityScale() },
            },
        });

        expect(program._channels.__placementIndex.data).toEqual(
            new Uint32Array([5, 8])
        );
        expect(program.drawCount).toBe(2);
        expect(program.resolveDrawRange(1, 1)).toEqual({
            firstInstance: 2,
            instanceCount: 1,
        });

        program.getSlotHandles().series.replace({
            __placementIndex: new Uint32Array([9, 10]),
            text: ["c", "dd"],
            x: new Float32Array([3, 4]),
        });
        expect(program._channels.__placementIndex.data).toEqual(
            new Uint32Array([9, 10])
        );
        expect(program.resolveDrawRange(0, 2)).toEqual({
            firstInstance: 0,
            instanceCount: 3,
        });
    });

    it("keeps 2,000 long labels and placement indices at logical cardinality", () => {
        const labels = Array.from(
            { length: 2000 },
            (_, index) => `Sample label ${index.toString().padStart(4, "0")}`
        );
        const placementIndices = Uint32Array.from(labels, (_, index) => index);
        const program = createTextProgram(createMockRenderer(), {
            count: labels.length,
            placementIndex: { data: placementIndices, type: "u32" },
            channels: {
                text: { data: labels },
                x: { value: 0, scale: identityScale() },
                y: { value: 0, scale: identityScale() },
            },
        });
        const glyphCount = labels.reduce(
            (count, label) => count + label.length,
            0
        );

        expect(placementIndices.byteLength).toBe(8000);
        expect(program.drawCount).toBe(2000);
        expect(program._channels.__placementIndex.data).toHaveLength(2000);
        expect(program._channels.__placementIndex.data.byteLength).toBe(8000);
        expect(program._channels.__placementIndex.data.at(-1)).toBe(1999);
        expect(
            program._seriesBuffers._packedBuffers.get("seriesU32")?.byteLength
        ).toBe(8000);
        expect(glyphCount * 8 - 8000).toBe(264000);
    });

    it("keeps scalar scale inputs logical for vector color outputs", () => {
        const program = createTextProgram(createMockRenderer(), {
            count: 2,
            channels: {
                text: { data: ["aa", "b"] },
                x: {
                    data: new Float32Array([1, 2]),
                    type: "f32",
                    scale: identityScale(),
                },
                y: { value: 0, scale: identityScale() },
                fill: {
                    data: new Float32Array([0, 1]),
                    type: "f32",
                    inputComponents: 1,
                    scale: thresholdScale({
                        domain: [0.5],
                        range: ["white", "black"],
                    }),
                },
            },
        });

        expect(program._channels.fill.data).toEqual(new Float32Array([0, 1]));

        program.getSlotHandles().series.replace({
            text: ["c", "dd"],
            x: new Float32Array([3, 4]),
            fill: new Float32Array([2, 3]),
        });

        expect(program._channels.fill.data).toEqual(new Float32Array([2, 3]));
    });

    it("keeps logical Float64 index values before high-precision packing", () => {
        const program = createTextProgram(createMockRenderer(), {
            count: 2,
            channels: {
                text: { data: ["aa", "b"] },
                x: {
                    data: new Float64Array([1, 2]),
                    type: "u32",
                    inputComponents: 2,
                    scale: indexScale({ domain: [0, 10] }),
                },
                y: { value: 0, scale: identityScale() },
            },
        });

        expect(program._channels.x.data).toEqual(new Float64Array([1, 2]));

        program.getSlotHandles().series.replace({
            text: ["c", "dd"],
            x: new Float64Array([3, 4]),
        });

        expect(program._channels.x.data).toEqual(new Float64Array([3, 4]));
    });

    it("rejects glyph-length arrays in the logical replacement API", () => {
        const program = createTextProgram(createMockRenderer(), {
            count: 2,
            channels: {
                text: { data: ["a", "b"] },
                x: {
                    data: new Float32Array([1, 2]),
                    type: "f32",
                    scale: identityScale(),
                },
                y: { value: 0, scale: identityScale() },
            },
        });

        expect(() =>
            program.getSlotHandles().series.replace({
                text: ["ab", "cd"],
                x: new Float32Array([1, 2, 3, 4]),
            })
        ).toThrow("Text series data count (4) does not match text count (2).");
    });

    it("rejects glyph-length arrays in the initial logical config", () => {
        expect(() =>
            createTextProgram(createMockRenderer(), {
                count: 2,
                channels: {
                    text: { data: ["ab", "cd"] },
                    x: {
                        data: new Float32Array([1, 2, 3, 4]),
                        type: "f32",
                        scale: identityScale(),
                    },
                    y: { value: 0, scale: identityScale() },
                },
            })
        ).toThrow("Text series data count (4) does not match text count (2).");
    });

    it("supports logical strings that produce no glyphs", () => {
        const program = createTextProgram(createMockRenderer(), {
            count: 2,
            channels: {
                text: { data: ["", ""] },
                x: {
                    data: new Float32Array([1, 2]),
                    type: "f32",
                    scale: identityScale(),
                },
                y: {
                    data: new Float32Array([3, 4]),
                    type: "f32",
                    scale: identityScale(),
                },
            },
        });

        expect(program.count).toBe(2);
        expect(program._channels.x.data).toHaveLength(2);
        expect(program._extraBuffers.get("glyphs")?.size).toBe(4);
        expect(
            Array.from(program._seriesBuffers._packedBuffers.values()).map(
                ({ buffer }) => buffer.size
            )
        ).toEqual([16]);
    });

    it("keeps and replaces a conditional series by logical name", () => {
        const program = createTextProgram(createMockRenderer(), {
            count: 2,
            channels: {
                uniqueId: {
                    data: new Uint32Array([1, 2]),
                    type: "u32",
                },
                text: { data: ["aa", "b"] },
                x: {
                    data: new Float32Array([1, 2]),
                    type: "f32",
                    scale: identityScale(),
                },
                y: { value: 0, scale: identityScale() },
                fill: {
                    value: [0, 0, 0, 1],
                    conditions: [
                        {
                            when: {
                                selection: "selected",
                                type: "single",
                            },
                            channel: {
                                data: new Float32Array([
                                    1, 0, 0, 1, 0, 1, 0, 1,
                                ]),
                                type: "f32",
                                components: 4,
                            },
                        },
                    ],
                },
            },
        });

        expect(program._channels.fill__cond0.data).toHaveLength(8);

        program.getSlotHandles().series.replace({
            uniqueId: new Uint32Array([3, 4]),
            text: ["ccc", "d"],
            x: new Float32Array([10, 20]),
            fill: new Float32Array([1, 0, 0, 1, 0, 0, 1, 1]),
        });

        expect(program._channels.fill__cond0.data).toEqual(
            new Float32Array([1, 0, 0, 1, 0, 0, 1, 1])
        );
    });
});

/**
 * @param {TextProgram} program
 * @param {string} name
 * @param {"f32" | "u32"} type
 */
function readUniform(program, name, type) {
    const entry = program._uniformBufferState.entries.get(name);
    if (!entry) {
        throw new Error(`Missing test uniform: ${name}`);
    }
    return type == "u32"
        ? program._uniformBufferState.view.getUint32(entry.offset, true)
        : program._uniformBufferState.view.getFloat32(entry.offset, true);
}

/**
 * @param {TextProgram} program
 * @param {string} name
 * @returns {number[]}
 */
function readUniformVector(program, name) {
    const entry = program._uniformBufferState.entries.get(name);
    if (!entry) {
        throw new Error(`Missing test uniform: ${name}`);
    }
    return Array.from({ length: 4 }, (_, index) =>
        program._uniformBufferState.view.getFloat32(
            entry.offset + index * 4,
            true
        )
    );
}
