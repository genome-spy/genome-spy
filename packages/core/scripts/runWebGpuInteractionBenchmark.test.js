import { describe, expect, test } from "vitest";

import {
    createReport,
    getCaseApplicability,
    parseArgs,
    renderReport,
    summarizeCadence,
    validateInteractionResult,
} from "./runWebGpuInteractionBenchmark.mjs";

describe("WebGPU interaction benchmark driver", () => {
    test("requires a spec and defaults to the complete counterbalanced matrix", () => {
        const options = parseArgs(["--spec", "private/example.json"]);

        expect(options.spec).toBe("private/example.json");
        expect(options.renderers).toEqual(["webgl", "webgpu"]);
        expect(options.runs).toBe(5);
        expect(options.cases).toHaveLength(6);
        expect(options.dprs).toEqual([1]);
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

    test("accepts Canvas as a CPU-renderer benchmark", () => {
        const options = parseArgs([
            "--spec",
            "example.json",
            "--renderer",
            "canvas",
        ]);

        expect(options.renderers).toEqual(["canvas"]);
    });

    test("makes a completed headed Canvas run authoritative without GPU metadata", () => {
        const options = parseArgs([
            "--spec",
            "example.json",
            "--renderer",
            "canvas",
            "--no-trace",
        ]);
        const sample = {
            status: "passed",
            subject: "main",
            renderer: "canvas",
            case: "wheel-zoom",
            dpr: 1,
            cadence: {
                intervals: { median: 16 },
                over33_3: 0,
            },
            profile: {
                frames: [{ kind: "render", duration: 16 }],
            },
            environment: {
                renderer: "canvas",
                canvas: { context: "2d" },
            },
            correctness: {
                repeatedCloseupTransitions: true,
                hoverAndPickingAfterMotion: true,
                filteringOrSortingFollowedByCloseup: false,
                resize: true,
                errors: [],
            },
        };

        const report = createReport({ options, samples: [sample] });

        expect(report.authoritative).toBe(true);
        expect(report.limitation).toBeUndefined();
        expect(report.sameBackendAa.values).toEqual([0]);
        expect(renderReport(report)).toContain(
            "# Renderer interaction benchmark report"
        );
    });

    test("adds an optional DPR sensitivity matrix", () => {
        const options = parseArgs([
            "--spec",
            "example.json",
            "--dpr",
            "1",
            "--sensitivity-dpr",
            "2",
        ]);

        expect(options.dprs).toEqual([1, 2]);
    });

    test("summarizes cadence thresholds independently from profiler frames", () => {
        const summary = summarizeCadence([0, 16, 32.8, 70]);

        expect(summary.frameCount).toBe(3);
        expect(summary.over16_7).toBe(2);
        expect(summary.over33_3).toBe(1);
        expect(summary.intervals.median).toBeCloseTo(16.8);
        expect(summary.intervals.max).toBe(37.2);
    });

    test("accepts an interaction with state change, input mapping, and coverage", () => {
        const state = {
            domains: [[0, 10]],
            peekState: 0,
            scrollOffset: 0,
            sampleView: true,
            closeupSupported: true,
        };

        const result = validateInteractionResult({
            caseName: "horizontal-wasd",
            before: state,
            after: { ...state, domains: [[1, 11]] },
            observations: [],
            inputActivation: { focused: true, hovered: true },
            keyboardEvents: [
                { type: "keydown", code: "KeyD" },
                { type: "keyup", code: "KeyD" },
            ],
            profile: {
                frames: [
                    { kind: "render" },
                    { kind: "render" },
                    { kind: "render" },
                ],
                phaseTotals: {},
            },
        });

        expect(result).toEqual({ passed: true, errors: [] });
    });

    test("rejects a no-op even when normal render frames were captured", () => {
        const state = {
            domains: [[0, 10]],
            peekState: 0,
            scrollOffset: 0,
            sampleView: true,
            closeupSupported: true,
        };

        const result = validateInteractionResult({
            caseName: "wasd-zoom",
            before: state,
            after: state,
            observations: [],
            inputActivation: { focused: true, hovered: false },
            keyboardEvents: [
                { type: "keydown", code: "KeyW" },
                { type: "keyup", code: "KeyW" },
            ],
            profile: {
                frames: [
                    { kind: "render" },
                    { kind: "render" },
                    { kind: "render" },
                ],
                phaseTotals: {},
            },
        });

        expect(result.passed).toBe(false);
        expect(result.errors).toContain(
            "wasd-zoom did not change an x-scale domain."
        );
    });

    test("marks closeup cases inapplicable when SampleView is absent", () => {
        expect(
            getCaseApplicability("open-closeup", {
                domains: [],
                peekState: undefined,
                scrollOffset: undefined,
                sampleView: false,
                closeupSupported: false,
            })
        ).toEqual({
            applicable: false,
            reason: "The subject does not expose a scrollable SampleView closeup state.",
        });
    });
});
