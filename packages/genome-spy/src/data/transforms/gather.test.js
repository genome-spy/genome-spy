import gatherTransform from "./gather";

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

/** @type { import("./gather").GatherConfig } */
const singleGatherConfig = {
    type: "gather",
    columnRegex: "^(.*)_a$",
    asValue: "a"
};

describe("Gather", () => {
    // TODO: Implement support for multiple variables

    test("Transform single variable", () => {
        const result = gatherTransform(singleGatherConfig, sampleData);
        console.log(JSON.stringify(result));
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
