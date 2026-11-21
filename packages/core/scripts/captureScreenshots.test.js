import { describe, expect, test } from "vitest";

import {
    collectCuratedExamplePaths,
    parseArgs,
} from "./captureScreenshots.mjs";

describe("captureScreenshots arguments", () => {
    test("enables non-writing example checks", () => {
        expect(
            parseArgs([
                "--check",
                "--server-url",
                "http://127.0.0.1:8080",
                "--renderer",
                "webgl",
                "examples/core/first.json",
            ])
        ).toEqual({
            check: true,
            help: false,
            examplePaths: ["examples/core/first.json"],
            renderer: "webgl",
            serverUrl: "http://127.0.0.1:8080",
            timeoutMs: 30_000,
            overwrite: undefined,
        });
    });

    test("rejects writing options in check mode", () => {
        expect(() => parseArgs(["--check", "--overwrite"])).toThrow(
            'Options "--check" and "--overwrite" cannot be combined.'
        );
    });

    test("rejects unknown renderers", () => {
        expect(() => parseArgs(["--renderer", "unknown"])).toThrow(
            "Unknown renderer: unknown"
        );
    });
});

test("selects experimental raster examples for Canvas and WebGPU batch capture", () => {
    const rasterExamples = [
        "examples/core/lazy-data/higlass-raster.json",
        "examples/core/raster/msa.json",
    ];
    for (const renderer of /** @type {const} */ (["canvas", "webgpu"])) {
        expect(collectCuratedExamplePaths(renderer)).toEqual(
            expect.arrayContaining(rasterExamples)
        );
    }
    const auto = collectCuratedExamplePaths("auto");
    for (const path of rasterExamples) {
        expect(auto).not.toContain(path);
    }
});
