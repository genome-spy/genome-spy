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

test("includes raster examples in batch capture", () => {
    expect(collectCuratedExamplePaths()).toEqual(
        expect.arrayContaining([
            "examples/core/raster/msa.json",
            "examples/docs/grammar/data/lazy/higlass-contact-map.json",
        ])
    );
});
