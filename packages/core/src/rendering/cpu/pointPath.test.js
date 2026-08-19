import { describe, expect, test, vi } from "vitest";
import { tracePointPath } from "./pointPath.js";

function createPathSink() {
    const path = {
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
    };
    return path;
}

describe("point paths", () => {
    test("recognizes every non-primitive point shape", () => {
        const shapes = [
            "cross",
            "diamond",
            "triangle-up",
            "triangle-right",
            "triangle-down",
            "triangle-left",
            "tick-up",
            "tick-right",
            "tick-down",
            "tick-left",
            "x",
            "+",
        ];

        for (const shape of shapes) {
            const path = createPathSink();
            expect(tracePointPath(shape, 0, 0, 10, path)).toBe(true);
            expect(path.moveTo).toHaveBeenCalled();
            expect(path.lineTo).toHaveBeenCalled();
        }
    });

    test("traces representative polygon, tick, and line shapes", () => {
        const diamond = createPathSink();
        tracePointPath("diamond", 20, 30, 10, diamond);
        expect(diamond.moveTo).toHaveBeenCalledWith(20, 20);
        expect(diamond.lineTo.mock.calls).toEqual([
            [30, 30],
            [20, 40],
            [10, 30],
        ]);
        expect(diamond.closePath).toHaveBeenCalledOnce();

        const tick = createPathSink();
        tracePointPath("tick-right", 20, 30, 10, tick);
        expect(tick.moveTo).toHaveBeenCalledWith(20, 28.5);
        expect(tick.lineTo.mock.calls).toEqual([
            [30, 28.5],
            [30, 31.5],
            [20, 31.5],
        ]);
        expect(tick.closePath).toHaveBeenCalledOnce();

        const x = createPathSink();
        tracePointPath("x", 20, 30, 10, x);
        expect(x.moveTo.mock.calls).toEqual([
            [10, 20],
            [30, 20],
        ]);
        expect(x.lineTo.mock.calls).toEqual([
            [30, 40],
            [10, 40],
        ]);
        expect(x.closePath).not.toHaveBeenCalled();
    });

    test("rejects primitives and unknown shapes", () => {
        const path = createPathSink();

        expect(tracePointPath("circle", 0, 0, 10, path)).toBe(false);
        expect(tracePointPath("square", 0, 0, 10, path)).toBe(false);
        expect(tracePointPath("star", 0, 0, 10, path)).toBe(false);
        expect(path.moveTo).not.toHaveBeenCalled();
    });
});
