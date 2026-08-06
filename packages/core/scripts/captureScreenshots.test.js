import { describe, expect, test } from "vitest";

import { parseArgs } from "./captureScreenshots.mjs";

describe("captureScreenshots arguments", () => {
    test("enables non-writing example checks", () => {
        expect(
            parseArgs([
                "--check",
                "--server-url",
                "http://127.0.0.1:8080",
                "examples/core/first.json",
            ])
        ).toEqual({
            check: true,
            help: false,
            examplePaths: ["examples/core/first.json"],
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
});
