import { describe, expect, test } from "vitest";
import { processData } from "../flowTestUtils";
import RegexFoldTransform from "./regexFold";

describe("RegexFold", () => {
    test("Transform single variable", () => {
        const sampleData = [
            {
                row: 1,
                sample1_a: "r1s1a",
                sample2_a: "r1s2a",
            },
            {
                row: 2,
                sample1_a: "r2s1a",
                sample2_a: "r2s2a",
            },
        ];

        /** @type { import("../../spec/transform").RegexFoldParams } */
        const singleGatherConfig = {
            type: "regexFold",
            columnRegex: "^(.*)_a$",
            asValue: "a",
        };

        const result = processData(
            new RegexFoldTransform(singleGatherConfig),
            sampleData
        );

        expect(result).toEqual([
            {
                row: 1,
                sample: "sample1",
                a: "r1s1a",
            },
            {
                row: 1,
                sample: "sample2",
                a: "r1s2a",
            },
            {
                row: 2,
                sample: "sample1",
                a: "r2s1a",
            },
            {
                row: 2,
                sample: "sample2",
                a: "r2s2a",
            },
        ]);
    });

    test("Transform single variable and skip specific columns", () => {
        const sampleData = [
            {
                row: 1,
                sample1_a: "r1s1a",
                sample2_a: "r1s2a",
            },
            {
                row: 2,
                sample1_a: "r2s1a",
                sample2_a: "r2s2a",
            },
        ];

        /** @type { import("../../spec/transform").RegexFoldParams } */
        const singleGatherConfig = {
            type: "regexFold",
            columnRegex: "^(.*)_a$",
            asValue: "a",
            skipRegex: "^row$",
        };

        const result = processData(
            new RegexFoldTransform(singleGatherConfig),
            sampleData
        );

        expect(result).toEqual([
            {
                sample: "sample1",
                a: "r1s1a",
            },
            {
                sample: "sample2",
                a: "r1s2a",
            },
            {
                sample: "sample1",
                a: "r2s1a",
            },
            {
                sample: "sample2",
                a: "r2s2a",
            },
        ]);
    });

    test("Transform multiple variables", () => {
        const sampleData = [
            {
                row: 1,
                sample1_a: "r1s1a",
                sample2_a: "r1s2a",
                sample1_b: "r1s1b",
                sample2_b: "r1s2b",
            },
            {
                row: 2,
                sample1_a: "r2s1a",
                sample2_a: "r2s2a",
                sample1_b: "r2s1b",
                sample2_b: "r2s2b",
            },
        ];

        /** @type { import("../../spec/transform").RegexFoldParams } */
        const singleGatherConfig = {
            type: "regexFold",
            columnRegex: ["^(.*)_a$", "^(.*)_b$"],
            asValue: ["a", "b"],
        };

        const result = processData(
            new RegexFoldTransform(singleGatherConfig),
            sampleData
        );

        expect(result).toEqual([
            {
                row: 1,
                sample: "sample1",
                a: "r1s1a",
                b: "r1s1b",
            },
            {
                row: 1,
                sample: "sample2",
                a: "r1s2a",
                b: "r1s2b",
            },
            {
                row: 2,
                sample: "sample1",
                a: "r2s1a",
                b: "r2s1b",
            },
            {
                row: 2,
                sample: "sample2",
                a: "r2s2a",
                b: "r2s2b",
            },
        ]);
    });
});
