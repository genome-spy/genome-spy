import { expect, test } from "vitest";
import {
    buildPackedSeriesLayout,
    packSeriesArrays,
} from "./packedSeriesLayout.js";

test("mixed scalar and vector channels share one record while aliases share an offset", () => {
    const x = new Float32Array([1, 2]);
    const channels =
        /** @type {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} */ ({
            x: { data: x, type: "f32", components: 1 },
            x2: { data: x, type: "f32", components: 1 },
            color: {
                data: new Float32Array([0, 0, 0, 1, 1, 0, 0, 1]),
                type: "f32",
                components: 4,
            },
            id: {
                data: new Uint32Array([16777217, 4294967294]),
                type: "u32",
                components: 1,
            },
            signed: {
                data: new Int32Array([-1, -2147483648]),
                type: "i32",
                components: 1,
            },
        });
    const layout = buildPackedSeriesLayout(
        channels,
        {},
        new Map([["x2", "x"]])
    );
    expect(layout.stride).toBe(7);
    expect(layout.entries.get("x2")).toBe(layout.entries.get("x"));
    const words = packSeriesArrays({ channels, layout, count: 2 });
    const floats = new Float32Array(words.buffer);
    expect(Array.from(floats.slice(0, 5))).toEqual([1, 0, 0, 0, 1]);
    expect(Array.from(floats.slice(7, 12))).toEqual([2, 1, 0, 0, 1]);
    expect([words[5], words[12]]).toEqual([16777217, 4294967294]);
    expect([words[6], words[13]]).toEqual([4294967295, 2147483648]);
});

test("packing preserves exact floating-point bits, including NaN payloads and negative zero", () => {
    const bits = new Uint32Array([0x7fc00001, 0x80000000]);
    const channels =
        /** @type {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} */ ({
            x: {
                data: new Float32Array(bits.buffer),
                type: "f32",
                components: 1,
            },
        });
    const layout = buildPackedSeriesLayout(channels, {});
    expect(packSeriesArrays({ channels, layout, count: 2 })).toEqual(bits);
});
