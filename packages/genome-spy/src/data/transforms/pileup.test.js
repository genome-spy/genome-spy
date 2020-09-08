import pileupTransform from "./pileup";

/**
 * @typedef {import("../../spec/transform").PileupConfig} PileupConfig
 */

test("Pileup transform produces correct pileup", () => {
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

    const piledUp = [0, 1, 2, 1, 0, 0, 1, 2, 0, 1, 2].map((d, i) => ({
        ...reads[i],
        lane: d
    }));

    /** @type {PileupConfig} */
    const coverageConfig = {
        type: "pileup",
        start: "start",
        end: "end"
    };
    expect(pileupTransform(coverageConfig, reads)).toEqual(piledUp);
});
