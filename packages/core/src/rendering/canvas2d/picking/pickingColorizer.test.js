import { expect, test } from "vitest";
import { colorizePickingIds } from "./pickingColorizer.js";

test("colorizes IDs into stable opaque diagnostic colors", () => {
    const ids = new Uint32Array([0, 1, 2, 1, 0xffffffff]);
    const colors = colorizePickingIds(ids);

    expect(Array.from(colors.subarray(0, 4))).toEqual([0, 0, 0, 255]);
    expect(Array.from(colors.subarray(4, 8))).toEqual(
        Array.from(colors.subarray(12, 16))
    );
    expect(Array.from(colors.subarray(4, 7))).not.toEqual(
        Array.from(colors.subarray(8, 11))
    );
    for (let offset = 3; offset < colors.length; offset += 4) {
        expect(colors[offset]).toBe(255);
    }
});

test("reuses caller-owned color storage", () => {
    const ids = new Uint32Array([1, 2]);
    const target = new Uint8ClampedArray(8);

    expect(colorizePickingIds(ids, target)).toBe(target);
    expect(() => colorizePickingIds(ids, new Uint8ClampedArray(7))).toThrow(
        RangeError
    );
});
