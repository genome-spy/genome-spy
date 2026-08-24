import { describe, expect, it, vi } from "vitest";

import { createMockRenderer } from "../../testUtils/mockRenderer.js";
import "../../fonts/lato.js";
import BmFontManager from "../../fonts/bmFontManager.js";
import { identityScale } from "../../scales/identity.js";
import { indexScale } from "../../scales/index.js";
import { thresholdScale } from "../../scales/threshold.js";
import TextProgram from "./textProgram.js";

describe("TextProgram series replacement", () => {
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

        expect(program._fontEntry.metrics).toBe(fontEntry.metrics);
    });

    it("invalidates the host when the font atlas becomes ready", () => {
        const renderer = createMockRenderer();
        renderer._invalidate = vi.fn();
        const program = new TextProgram(renderer, {
            channels: {
                text: { value: "x" },
                x: { value: 0, scale: identityScale() },
                y: { value: 0, scale: identityScale() },
            },
        });

        program._setAtlasFromBitmap(
            /** @type {ImageBitmap} */ ({ width: 2, height: 2 })
        );

        expect(renderer._invalidate).toHaveBeenCalledOnce();

        program.destroy();
        program._setAtlasFromBitmap(
            /** @type {ImageBitmap} */ ({ width: 2, height: 2 })
        );
        expect(renderer._invalidate).toHaveBeenCalledOnce();
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

        expect(program.count).toBe(3);
        expect(program._textLayout.glyphIds).toHaveLength(3);
        expect(program._channels.x.data).toEqual(
            new Float32Array([10, 10, 20])
        );
        expect(program._channels.y.data).toEqual(
            new Float32Array([30, 30, 40])
        );
        expect(program._pipeline).toBe(pipeline);
        expect(program._extraTextures.get("fontAtlas")?.texture).toBe(
            fontAtlas
        );
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
        expect(program._textLayout.textWidth).toHaveLength(2);
    });

    it("preserves aliases while expanding logical per-string arrays", () => {
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
        expect(program._channels.x.data).toEqual(
            new Float32Array([10, 10, 10, 20])
        );
    });

    it("expands and replaces per-string placement indices", () => {
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
            new Uint32Array([5, 5, 8])
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
            new Uint32Array([9, 10, 10])
        );
        expect(program.resolveDrawRange(0, 2)).toEqual({
            firstInstance: 0,
            instanceCount: 3,
        });
    });

    it("keeps 2,000 long labels in one logical mark and one glyph index series", () => {
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
        expect(program._channels.__placementIndex.data).toHaveLength(
            glyphCount
        );
        expect(program._channels.__placementIndex.data.byteLength).toBe(
            glyphCount * 4
        );
        expect(program._channels.__placementIndex.data.at(-1)).toBe(1999);
    });

    it("expands scalar scale inputs for vector color outputs", () => {
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

        expect(program._channels.fill.data).toEqual(
            new Float32Array([0, 0, 1])
        );

        program.getSlotHandles().series.replace({
            text: ["c", "dd"],
            x: new Float32Array([3, 4]),
            fill: new Float32Array([2, 3]),
        });

        expect(program._channels.fill.data).toEqual(
            new Float32Array([2, 3, 3])
        );
    });

    it("expands logical Float64 index values before high-precision packing", () => {
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

        expect(program._channels.x.data).toEqual(new Float64Array([1, 1, 2]));

        program.getSlotHandles().series.replace({
            text: ["c", "dd"],
            x: new Float64Array([3, 4]),
        });

        expect(program._channels.x.data).toEqual(new Float64Array([3, 4, 4]));
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
        ).toThrow('Text channel "x" expects 2 values, got 4.');
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

        expect(program.count).toBe(0);
        expect(program._channels.x.data).toHaveLength(0);
        expect(program._extraBuffers.get("glyphs")?.size).toBe(4);
        expect(
            Array.from(program._seriesBuffers._packedBuffers.values()).map(
                ({ buffer }) => buffer.size
            )
        ).toEqual([4, 4]);
    });

    it("expands and replaces a single conditional series by logical name", () => {
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

        expect(program._channels.fill__cond0.data).toHaveLength(12);

        program.getSlotHandles().series.replace({
            uniqueId: new Uint32Array([3, 4]),
            text: ["ccc", "d"],
            x: new Float32Array([10, 20]),
            fill: new Float32Array([1, 0, 0, 1, 0, 0, 1, 1]),
        });

        expect(program._channels.fill__cond0.data).toEqual(
            new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1])
        );
    });
});
