import { describe, expect, test } from "vitest";

import {
    parseArgs,
    summarizeCadence,
} from "./runWebGpuInteractionBenchmark.mjs";

describe("WebGPU interaction benchmark driver", () => {
    test("requires a spec and defaults to the complete counterbalanced matrix", () => {
        const options = parseArgs(["--spec", "private/example.json"]);

        expect(options.spec).toBe("private/example.json");
        expect(options.renderers).toEqual(["webgl", "webgpu"]);
        expect(options.runs).toBe(5);
        expect(options.cases).toHaveLength(7);
        expect(options.dprs).toEqual([1, 2]);
        expect(options.headed).toBe(true);
    });

    test("accepts a reduced diagnostic matrix without changing the defaults", () => {
        const options = parseArgs([
            "--spec",
            "example.json",
            "--renderer",
            "webgpu",
            "--cases",
            "horizontal-drag,open-closeup",
            "--runs",
            "2",
            "--headless",
            "--no-trace",
        ]);

        expect(options.renderers).toEqual(["webgpu"]);
        expect(options.cases).toEqual(["horizontal-drag", "open-closeup"]);
        expect(options.runs).toBe(2);
        expect(options.headed).toBe(false);
        expect(options.traces).toBe(false);
    });

    test("summarizes cadence thresholds independently from profiler frames", () => {
        const summary = summarizeCadence([0, 16, 32.8, 70]);

        expect(summary.frameCount).toBe(3);
        expect(summary.over16_7).toBe(2);
        expect(summary.over33_3).toBe(1);
        expect(summary.intervals.median).toBeCloseTo(16.8);
        expect(summary.intervals.max).toBe(37.2);
    });
});
