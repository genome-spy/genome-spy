import { describe, expect, it } from "vitest";
import {
    buildPackedSeriesLayout,
    packSeriesArrays,
} from "./packedSeriesLayout.js";

describe("buildPackedSeriesLayout", () => {
    it("assigns per-instance offsets and strides by scalar type", () => {
        const channels = {
            x: {
                data: new Float32Array([1, 2]),
                type: "f32",
                components: 1,
            },
            color: {
                data: new Float32Array([0, 0, 0, 1, 1, 0, 0, 1]),
                type: "f32",
                components: 4,
            },
            id: {
                data: new Uint32Array([10, 20]),
                type: "u32",
                components: 1,
            },
            signed: {
                data: new Int32Array([1, -1]),
                type: "i32",
                components: 1,
            },
        };

        const layout = buildPackedSeriesLayout(
            // @ts-expect-error test inputs are partial
            channels,
            {}
        );

        const xEntry = layout.entries.get("x");
        const colorEntry = layout.entries.get("color");
        const idEntry = layout.entries.get("id");
        const signedEntry = layout.entries.get("signed");

        expect(layout.f32Stride).toBe(5);
        expect(layout.u32Stride).toBe(1);
        expect(layout.i32Stride).toBe(1);
        expect(xEntry).toMatchObject({ offset: 0, stride: 5, components: 1 });
        expect(colorEntry).toMatchObject({
            offset: 1,
            stride: 5,
            components: 4,
        });
        expect(idEntry).toMatchObject({ offset: 0, stride: 1, components: 1 });
        expect(signedEntry).toMatchObject({
            offset: 0,
            stride: 1,
            components: 1,
        });
    });
});

describe("packSeriesArrays", () => {
    it("packs per-instance series values into f32/u32 buffers", () => {
        const channels = {
            x: {
                data: new Float32Array([1, 2]),
                type: "f32",
                components: 1,
            },
            color: {
                data: new Float32Array([0, 0, 0, 1, 1, 0, 0, 1]),
                type: "f32",
                components: 4,
            },
            id: {
                data: new Uint32Array([10, 20]),
                type: "u32",
                components: 1,
            },
            signed: {
                data: new Int32Array([1, -1]),
                type: "i32",
                components: 1,
            },
        };

        const layout = buildPackedSeriesLayout(
            // @ts-expect-error test inputs are partial
            channels,
            {}
        );
        const { f32, u32, i32 } = packSeriesArrays({
            // @ts-expect-error test inputs are partial
            channels,
            channelSpecs: {},
            layout,
            count: 2,
        });

        expect(Array.from(f32 ?? [])).toEqual([1, 0, 0, 0, 1, 2, 1, 0, 0, 1]);
        expect(Array.from(u32 ?? [])).toEqual([10, 20]);
        expect(Array.from(i32 ?? [])).toEqual([1, -1]);
    });
});
