import { describe, expect, test } from "vitest";

import { parseArgs, summarize, summarizeSamples } from "./run.mjs";

describe("resource-sharing benchmark", () => {
    test("uses the pathological 500 + 500 mark default", () => {
        const options = parseArgs([]);

        expect(options.count).toBe(500);
        expect(options.runs).toBe(3);
        expect(options.headless).toBe(false);
    });

    test("accepts a larger diagnostic run", () => {
        const options = parseArgs([
            "--count",
            "1000",
            "--runs",
            "1",
            "--duration-ms",
            "500",
            "--settled-frames",
            "2",
            "--headless",
        ]);

        expect(options).toMatchObject({
            count: 1000,
            runs: 1,
            durationMs: 500,
            settledFrames: 2,
            headless: true,
        });
    });

    test("summarizes initialization and both render orders separately", () => {
        const sample = (mode, order, value) => ({
            mode,
            order,
            initialization: { jsMs: value, gpuSettledMs: value + 1 },
            render: {
                order,
                fps: (order === "grouped" ? 60 : 50) + value,
                jsFrameMs: {
                    median: value + (order === "grouped" ? 2 : 4),
                },
                gpuSettledFrameMs: {
                    median: value + (order === "grouped" ? 3 : 5),
                },
            },
        });

        const result = summarizeSamples([
            sample("shared", "grouped", 1),
            sample("shared", "grouped", 2),
            sample("shared", "alternating", 1),
            sample("shared", "alternating", 2),
            sample("unshared", "grouped", 10),
            sample("unshared", "grouped", 20),
            sample("unshared", "alternating", 10),
            sample("unshared", "alternating", 20),
        ]);

        expect(result.shared.initialization.jsMs.median).toBe(2);
        expect(result.shared.render.grouped.fps.median).toBe(62);
        expect(result.unshared.render.alternating.jsFrameMs.median).toBe(24);
        expect(summarize([3, 1, 2]).median).toBe(2);
    });
});
