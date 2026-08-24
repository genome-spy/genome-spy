import { afterEach, describe, expect, test } from "vitest";

import {
    countPerformance,
    getPerformanceProfiler,
    measurePerformance,
    startPerformanceProfiler,
} from "./performanceProfiler.js";

const profilerKey = Symbol.for("genome-spy.performance-profiler");

afterEach(() => {
    const globalObject = /** @type {Record<symbol, unknown>} */ (globalThis);
    delete globalObject[profilerKey];
});

describe("private performance profiler", () => {
    test("is inert until explicitly activated", () => {
        expect(getPerformanceProfiler()).toBeUndefined();
        expect(measurePerformance("unused", () => 42)).toBe(42);
        countPerformance("unused");
    });

    test("records frame phases and counters", () => {
        const profiler = startPerformanceProfiler();
        profiler.beginFrame("webgpu");
        measurePerformance("phase", /** @returns {void} */ () => undefined);
        countPerformance("writes", 3);
        profiler.endFrame();

        const snapshot = profiler.snapshot();
        expect(snapshot.frames).toHaveLength(1);
        expect(snapshot.frames[0]).toMatchObject({
            renderer: "webgpu",
            kind: "render",
            counts: { writes: 3 },
        });
        expect(snapshot.phaseTotals.phase).toBeGreaterThanOrEqual(0);
        expect(snapshot.countTotals.writes).toBe(3);
    });

    test("closes an unfinished frame when a new frame begins", () => {
        const profiler = startPerformanceProfiler();
        profiler.beginFrame("webgl");
        profiler.beginFrame("webgl");
        profiler.endFrame();

        expect(profiler.snapshot().frames).toHaveLength(2);
    });
});
