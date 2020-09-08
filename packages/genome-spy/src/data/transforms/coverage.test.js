import coverageTransform from "./coverage";

/**
 * @typedef {import("../../spec/transform").CoverageConfig} CoverageConfig
 */

const reads = [
    [0, 4],
    [1, 3],
    [2, 6],
    [4, 8],
    [8, 10],
    [11, 14],
    [11, 13],
    [11, 12],
    [15, 18],
    [16, 18],
    [17, 18]
].map(d => ({
    start: d[0],
    end: d[1]
}));

const coverageSegments = [
    [0, 1, 1],
    [1, 2, 2],
    [2, 3, 3],
    [3, 6, 2],
    [6, 10, 1],
    [11, 12, 3],
    [12, 13, 2],
    [13, 14, 1],
    [15, 16, 1],
    [16, 17, 2],
    [17, 18, 3]
].map(d => ({
    start: d[0],
    end: d[1],
    coverage: d[2]
}));

test("Coverage transform produces correct coverage segments", () => {
    /** @type {CoverageConfig} */
    const coverageConfig = {
        type: "coverage",
        start: "start",
        end: "end"
    };
    expect(coverageTransform(coverageConfig, reads)).toEqual(coverageSegments);
});
