import gatherTransform, { gather } from "./gather";

const sampleData = [
    { row: 1, sample1_a: "r1s1a", sample2_a: "r1s2a", sample1_b: "r1s1b", sample2_b: "r1s2b" },
    { row: 2, sample1_a: "r2s1a", sample2_a: "r2s2a", sample1_b: "r2s1b", sample2_b: "r2s2b" },
    { row: 3, sample1_a: "r3s1a", sample2_a: "r3s2a", sample1_b: "r3s1b", sample2_b: "r3s2b" }
];

sampleData.columns = ["row", "sample1_a", "sample2_a", "sample1_b", "sample2_b"];

/** @type { import("./gather").GatherConfig } */
const singleGatherConfig = {
    type: "gather",
    columnRegex: "^(.*)_a$",
    asValue: "a"
}

describe("Gather", () => {
    test("Gather single variable", () => {
        expect(gather(singleGatherConfig, sampleData)).toEqual(new Map([
            ["sample1", [{ a: "r1s1a" }, { a: "r2s1a" }, { a: "r3s1a" }]],
            ["sample2", [{ a: "r1s2a" }, { a: "r2s2a" }, { a: "r3s2a" }]],
        ]));
    });

    // TODO: Implement support for multiple variables

    test("Transform single variable", () => {
        expect(gatherTransform(singleGatherConfig, sampleData)).toEqual([
            { sample: "sample1", row: 1, a: "r1s1a", sample1_b: "r1s1b", sample2_b: "r1s2b" },
            { sample: "sample1", row: 2, a: "r2s1a", sample1_b: "r2s1b", sample2_b: "r2s2b" },
            { sample: "sample1", row: 3, a: "r3s1a", sample1_b: "r3s1b", sample2_b: "r3s2b" },
            { sample: "sample2", row: 1, a: "r1s2a", sample1_b: "r1s1b", sample2_b: "r1s2b" },
            { sample: "sample2", row: 2, a: "r2s2a", sample1_b: "r2s1b", sample2_b: "r2s2b" },
            { sample: "sample2", row: 3, a: "r3s2a", sample1_b: "r3s1b", sample2_b: "r3s2b" }
        ]);
    });

});