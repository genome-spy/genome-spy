import { describe, expect, it, vi } from "vitest";

import { createMockRenderer } from "../../testUtils/mockRenderer.js";
import "../../fonts/lato.js";
import BmFontManager from "../../fonts/bmFontManager.js";
import { identityScale } from "../../scales/identity.js";
import { indexScale } from "../../scales/index.js";
import { thresholdScale } from "../../scales/threshold.js";
import TextProgram from "./textProgram.js";

/**
 * @param {import("../../renderer.js").Renderer} renderer
 * @returns {{ glyphMetrics: GPUBuffer, atlas: { texture: GPUTexture }, upload: (image: ImageBitmap) => void, destroy: () => void }}
 */
function getOnlyFontResources(renderer) {
    const [resourcesByBitmap] = renderer._fontResourceCache.values();
    const [resources] = resourcesByBitmap.values();
    return /** @type {any} */ (resources);
}

describe("TextProgram series replacement", () => {
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
            "let localPixel = localAnchor + rotated;\n    let pixel = anchor + rotated"
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
    });

    it("updates coupled text uniforms through semantic properties", () => {
        const renderer = createMockRenderer();
        const program = new TextProgram(renderer, {
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
        const program = new TextProgram(createMockRenderer(), {
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

    it("uses Core-provided font metrics and atlas resources", () => {
        const renderer = createMockRenderer();
        const fontEntry = new BmFontManager().getDefaultFont();
        const program = new TextProgram(renderer, {
            font: "Test Sans",
            fontResource: {
                metrics: fontEntry.metrics,
                bitmap: /** @type {any} */ ({}),
            },
            channels: {
                text: { value: "x" },
                x: { value: 0, scale: identityScale() },
                y: { value: 0, scale: identityScale() },
            },
        });

        expect(
            program._fontManager.getFont("Test Sans", "normal", 400).metrics
        ).toBe(fontEntry.metrics);
        // The uploaded per-glyph arrays must not remain reachable through config.
        expect(program._markConfig.textLayout).toBeUndefined();
    });

    it("shares immutable font GPU resources between text programs", () => {
        const renderer = createMockRenderer();
        const createBuffer = vi.spyOn(renderer.device, "createBuffer");
        const createTexture = vi.spyOn(renderer.device, "createTexture");
        const createSampler = vi.spyOn(renderer.device, "createSampler");
        const writeTexture = vi.spyOn(renderer.device.queue, "writeTexture");
        const config = {
            channels: {
                text: { value: "x" },
                x: { value: 0, scale: identityScale() },
                y: { value: 0, scale: identityScale() },
            },
        };

        const first = new TextProgram(renderer, config);
        const second = new TextProgram(renderer, config);

        expect(second._extraBuffers.get("glyphMetrics")).toBe(
            first._extraBuffers.get("glyphMetrics")
        );
        expect(second._extraTextures.get("fontAtlas")?.texture).toBe(
            first._extraTextures.get("fontAtlas")?.texture
        );
        expect(second._extraBuffers.get("glyphs")).not.toBe(
            first._extraBuffers.get("glyphs")
        );
        expect(createTexture).toHaveBeenCalledOnce();
        expect(createSampler).toHaveBeenCalledOnce();
        expect(writeTexture).toHaveBeenCalledOnce();
        expect(
            createBuffer.mock.calls.filter(([descriptor]) =>
                descriptor.label?.endsWith(": glyph metrics")
            )
        ).toHaveLength(1);
    });

    it("does not share different font bitmap resources", () => {
        const renderer = createMockRenderer();
        const metrics = new BmFontManager().getDefaultFont().metrics;
        const create = (/** @type {string} */ bitmap) =>
            new TextProgram(renderer, {
                font: "Test Sans",
                fontResource: { metrics, bitmap },
                channels: {
                    text: { value: "x" },
                    x: { value: 0, scale: identityScale() },
                    y: { value: 0, scale: identityScale() },
                },
            });

        const first = create("first.png");
        const second = create("second.png");

        expect(second._extraTextures.get("fontAtlas")?.texture).not.toBe(
            first._extraTextures.get("fontAtlas")?.texture
        );
    });

    it("uploads a shared atlas in place while the renderer is alive", () => {
        const renderer = createMockRenderer();
        renderer._invalidate = vi.fn();
        const program = new TextProgram(renderer, {
            channels: {
                text: { value: "x" },
                x: { value: 0, scale: identityScale() },
                y: { value: 0, scale: identityScale() },
            },
        });
        const resources = getOnlyFontResources(renderer);
        const atlas = program._extraTextures.get("fontAtlas");
        const copyAtlas = vi.spyOn(
            renderer.device.queue,
            "copyExternalImageToTexture"
        );
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        resources.upload(/** @type {ImageBitmap} */ ({ width: 1, height: 1 }));
        expect(copyAtlas).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledOnce();

        resources.upload(
            /** @type {ImageBitmap} */ ({
                width: atlas.width,
                height: atlas.height,
            })
        );

        expect(renderer._invalidate).toHaveBeenCalledOnce();
        expect(copyAtlas).toHaveBeenCalledOnce();

        renderer._isAlive = () => false;
        resources.upload(
            /** @type {ImageBitmap} */ ({
                width: atlas.width,
                height: atlas.height,
            })
        );
        expect(renderer._invalidate).toHaveBeenCalledOnce();
        warn.mockRestore();
    });

    it("keeps shared font resources alive until the renderer releases them", () => {
        const renderer = createMockRenderer();
        const program = new TextProgram(renderer, {
            channels: {
                text: { value: "x" },
                x: { value: 0, scale: identityScale() },
                y: { value: 0, scale: identityScale() },
            },
        });
        const resources = getOnlyFontResources(renderer);
        const destroyMetrics = vi.spyOn(resources.glyphMetrics, "destroy");
        const destroyAtlas = vi.spyOn(resources.atlas.texture, "destroy");

        program.destroy();
        expect(destroyMetrics).not.toHaveBeenCalled();
        expect(destroyAtlas).not.toHaveBeenCalled();

        resources.destroy();
        resources.destroy();
        expect(destroyMetrics).toHaveBeenCalledOnce();
        expect(destroyAtlas).toHaveBeenCalledOnce();
    });

    it("rebuilds glyph layout from logical strings without recreating the pipeline", () => {
        const renderer = createMockRenderer();
        const program = new TextProgram(renderer, {
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
        expect(program._glyphOffsets).toEqual(new Uint32Array([0, 2, 3]));
        expect(program._channels.x.data).toEqual(new Float32Array([10, 20]));
        expect(program._channels.y.data).toEqual(new Float32Array([30, 40]));
        expect(program._pipeline).toBe(pipeline);
        expect(program._extraTextures.get("fontAtlas")?.texture).toBe(
            fontAtlas
        );
    });

    it("rebuilds its bind group only when text layout buffers grow", () => {
        const renderer = createMockRenderer();
        const program = new TextProgram(renderer, {
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
        const program = new TextProgram(createMockRenderer(), {
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
        expect(program._glyphOffsets).toEqual(new Uint32Array([0, 1, 2]));
    });

    it("preserves aliases between logical per-string arrays", () => {
        const shared = new Float32Array([1, 2]);
        const program = new TextProgram(createMockRenderer(), {
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
        const program = new TextProgram(createMockRenderer(), {
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
        const program = new TextProgram(createMockRenderer(), {
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
        const program = new TextProgram(createMockRenderer(), {
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
        const program = new TextProgram(createMockRenderer(), {
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
        const program = new TextProgram(createMockRenderer(), {
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
        expect(
            () =>
                new TextProgram(createMockRenderer(), {
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
        const program = new TextProgram(createMockRenderer(), {
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
        const program = new TextProgram(createMockRenderer(), {
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
