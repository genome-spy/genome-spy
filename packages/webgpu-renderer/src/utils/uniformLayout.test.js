import { describe, expect, it } from "vitest";
import { buildUniformLayout } from "./uniformLayout.js";

describe("buildUniformLayout", () => {
    it("aligns scalars, vec2, and vec4 to expected offsets", () => {
        const layout = buildUniformLayout([
            { name: "a", type: "f32", components: 1 },
            { name: "b", type: "f32", components: 2 },
            { name: "c", type: "f32", components: 1 },
            { name: "d", type: "f32", components: 4 },
        ]);

        expect(layout.entries.get("a")?.offset).toBe(0);
        expect(layout.entries.get("b")?.offset).toBe(8);
        expect(layout.entries.get("c")?.offset).toBe(16);
        expect(layout.entries.get("d")?.offset).toBe(32);
        expect(layout.byteLength).toBe(48);
    });

    it("aligns uniform arrays to 16-byte strides", () => {
        const layout = buildUniformLayout([
            { name: "a", type: "f32", components: 1 },
            { name: "b", type: "f32", components: 1, arrayLength: 3 },
            { name: "c", type: "f32", components: 4 },
        ]);

        expect(layout.entries.get("a")?.offset).toBe(0);
        expect(layout.entries.get("b")?.offset).toBe(16);
        expect(layout.entries.get("c")?.offset).toBe(64);
        expect(layout.byteLength).toBe(80);
    });
});
