import { describe, expect, test } from "vitest";
import SoftwarePickingBuffer from "./softwarePickingBuffer.js";

describe("SoftwarePickingBuffer", () => {
    test("floors logical dimensions and excludes the fractional fringe", () => {
        const buffer = new SoftwarePickingBuffer(4.9, 3.2);
        buffer.ids[2 * buffer.width + 3] = 42;

        expect(buffer.width).toBe(4);
        expect(buffer.height).toBe(3);
        expect(buffer.ids).toHaveLength(12);
        expect(buffer.read(3.99, 2.99)).toBe(42);
        expect(buffer.read(4, 2)).toBe(0);
        expect(buffer.read(3, 3)).toBe(0);
        expect(buffer.read(-0.01, 0)).toBe(0);
    });

    test("preserves storage for an unchanged size and clears it explicitly", () => {
        const buffer = new SoftwarePickingBuffer(2, 2);
        const ids = buffer.ids;
        ids[0] = 7;

        expect(buffer.resize(2.9, 2.1)).toBe(false);
        expect(buffer.ids).toBe(ids);
        expect(buffer.read(0, 0)).toBe(7);

        buffer.clear();
        expect(Array.from(buffer.ids)).toEqual([0, 0, 0, 0]);
    });

    test("reallocates on resize and disposes storage", () => {
        const buffer = new SoftwarePickingBuffer(2, 2);
        buffer.ids[0] = 7;

        expect(buffer.resize(3, 1)).toBe(true);
        expect(Array.from(buffer.ids)).toEqual([0, 0, 0]);

        buffer.dispose();
        expect(buffer.width).toBe(0);
        expect(buffer.height).toBe(0);
        expect(buffer.ids).toHaveLength(0);
        expect(buffer.read(0, 0)).toBe(0);
    });

    test("rejects invalid dimensions and safely rejects invalid reads", () => {
        const buffer = new SoftwarePickingBuffer();

        expect(() => buffer.resize(-1, 2)).toThrow(RangeError);
        expect(() => buffer.resize(Infinity, 2)).toThrow(RangeError);
        expect(buffer.read(NaN, 0)).toBe(0);
        expect(buffer.read(0, Infinity)).toBe(0);
    });
});
