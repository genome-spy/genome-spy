import { describe, expect, it } from "vitest";
import { UniformBuffer } from "./uniformBuffer.js";

describe("UniformBuffer", () => {
    it("packs scalar and vec2 values with alignment", () => {
        const buffer = new UniformBuffer([
            { name: "a", type: "f32", components: 1 },
            { name: "b", type: "f32", components: 2 },
            { name: "c", type: "u32", components: 1 },
        ]);

        buffer.setValue("a", 2);
        buffer.setValue("b", [3, 4]);
        buffer.setValue("c", 7);

        const view = new DataView(buffer.data);
        expect(view.getFloat32(0, true)).toBe(2);
        expect(view.getFloat32(8, true)).toBe(3);
        expect(view.getFloat32(12, true)).toBe(4);
        expect(view.getUint32(16, true)).toBe(7);
    });

    it("retains writers for exact integer and strided vector packing", () => {
        const buffer = new UniformBuffer([
            { name: "signed", type: "i32", components: 1 },
            { name: "ids", type: "u32", components: 2 },
            { name: "colors", type: "f32", components: 4, arrayLength: 2 },
        ]);
        const writeIds = buffer.getSetter("ids");
        buffer.getSetter("signed")(-7);
        writeIds(new Uint32Array([0xffffffff, 0x80000000]));
        buffer.getSetter("colors")([
            [0.25, 0.5, 0.75, 1],
            [1, 2, 3, 4],
        ]);

        const view = new DataView(buffer.data);
        expect(view.getInt32(0, true)).toBe(-7);
        expect(view.getUint32(8, true)).toBe(0xffffffff);
        expect(view.getUint32(12, true)).toBe(0x80000000);
        expect(Array.from(new Float32Array(buffer.data, 16, 8))).toEqual([
            0.25, 0.5, 0.75, 1, 1, 2, 3, 4,
        ]);
        expect(() => writeIds([1])).toThrow("expects 2 components");
        expect(view.getUint32(12, true)).toBe(0x80000000);
    });

    it("writes uniform arrays with 16-byte stride", () => {
        const buffer = new UniformBuffer([
            { name: "domain", type: "f32", components: 1, arrayLength: 3 },
        ]);

        buffer.setValue("domain", [1, 2, 3]);

        const view = new DataView(buffer.data);
        expect(view.getFloat32(0, true)).toBe(1);
        expect(view.getFloat32(16, true)).toBe(2);
        expect(view.getFloat32(32, true)).toBe(3);
    });
});
