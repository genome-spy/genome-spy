import { processData } from "../flowTestUtils";
import RegexFoldTransform from "./regexFold";

const sampleData = [
    {
        row: 1,
        sample1_a: "r1s1a",
        sample2_a: "r1s2a"
    },
    {
        row: 2,
        sample1_a: "r2s1a",
        sample2_a: "r2s2a"
    }
];

/** @type { import("../../spec/transform").RegexFoldConfig } */
const singleGatherConfig = {
    type: "gather",
    columnRegex: "^(.*)_a$",
    asValue: "a"
};

describe("RegexFold", () => {
    // TODO: Implement support for multiple variables

    test("Transform single variable", () => {
        const result = processData(
            new RegexFoldTransform(singleGatherConfig),
            sampleData
        );

        expect(result).toEqual([
            {
                row: 1,
                sample: "sample1",
                a: "r1s1a"
            },
            {
                row: 1,
                sample: "sample2",
                a: "r1s2a"
            },
            {
                row: 2,
                sample: "sample1",
                a: "r2s1a"
            },
            {
                row: 2,
                sample: "sample2",
                a: "r2s2a"
            }
        ]);
    });
});
