import { describe, expect, test } from "vitest";
import makeRingBuffer from "./ringBuffer.js";

describe("ringBuffer", () => {
    test("Empty buffer", () => {
        const buffer = makeRingBuffer(10);
        expect(buffer.length()).toBe(0);
        expect(buffer.get()).toEqual([]);
    });

    test("Partially filled buffer", () => {
        const buffer = makeRingBuffer(10);
        buffer.push(1);
        buffer.push(2);
        buffer.push(3);
        expect(buffer.length()).toBe(3);
        expect(buffer.get()).toEqual([1, 2, 3]);
    });

    test("Full buffer", () => {
        const buffer = makeRingBuffer(3);
        buffer.push(1);
        buffer.push(2);
        buffer.push(3);
        expect(buffer.length()).toBe(3);
        expect(buffer.get()).toEqual([1, 2, 3]);
    });

    test("Overfilled buffer", () => {
        const buffer = makeRingBuffer(3);
        buffer.push(1);
        buffer.push(2);
        buffer.push(3);
        buffer.push(4);
        buffer.push(5);
        expect(buffer.length()).toBe(3);
        expect(buffer.get()).toEqual([3, 4, 5]);
    });
});
