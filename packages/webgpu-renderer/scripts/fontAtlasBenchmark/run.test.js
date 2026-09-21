import { describe, expect, test } from "vitest";

import { createSyntheticLabels } from "../../tests/fixtures/syntheticOutlineFont.js";
import { parseArgs, summarize, summarizeSamples } from "./run.mjs";

describe("font-atlas benchmark", () => {
    test("defaults to a pathological dynamic-label workload", () => {
        expect(parseArgs([])).toMatchObject({
            labels: 10_000,
            uniqueGlyphs: 256,
            labelLength: 6,
            growthRounds: 4,
            steadyUpdates: 5,
            renderFrames: 5,
            runs: 3,
            headless: false,
        });
    });

    test("accepts a small diagnostic workload", () => {
        expect(
            parseArgs([
                "--labels",
                "2000",
                "--unique-glyphs",
                "64",
                "--label-length",
                "3",
                "--growth-rounds",
                "2",
                "--steady-updates",
                "2",
                "--render-frames",
                "2",
                "--runs",
                "1",
                "--headless",
            ])
        ).toMatchObject({
            labels: 2000,
            uniqueGlyphs: 64,
            labelLength: 3,
            growthRounds: 2,
            steadyUpdates: 2,
            renderFrames: 2,
            runs: 1,
            headless: true,
        });
    });

    test("each batch includes every requested synthetic outline", () => {
        const labels = createSyntheticLabels(100, 34, 3, 7);
        const codePoints = new Set(
            labels.flatMap((label) =>
                Array.from(label, (value) => value.codePointAt(0))
            )
        );

        expect(codePoints.size).toBe(34);
    });

    test("summarizes growth, steady updates, and static rendering separately", () => {
        const sample = (offset) => ({
            growth: [
                { prepareJsMs: 1 + offset, readyMs: 3 + offset },
                { prepareJsMs: 2 + offset, readyMs: 4 + offset },
            ],
            steady: [{ prepareJsMs: 5 + offset, readyMs: 6 + offset }],
            staticFrames: [{ jsMs: 7 + offset, settledMs: 8 + offset }],
            finalAtlas: { width: 512, height: 1024, bytes: 4_194_304 },
        });
        const result = summarizeSamples([sample(0), sample(10)]);

        expect(summarize([3, 1, 2]).median).toBe(2);
        expect(result.growth.prepareJsMs.median).toBe(23);
        expect(result.steadyUpdate.readyMs.median).toBe(16);
        expect(result.staticRender.settledMs.median).toBe(18);
        expect(result.finalAtlas.width).toBe(512);
    });
});
