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
