import PileupTransform from "./pileup";
import { processData } from "../flowTestUtils";

/**
 * @typedef {import("../../spec/transform").PileupConfig} PileupConfig
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

const lanes = [0, 1, 2, 1, 0, 0, 1, 2, 0, 1, 2];

/** @type {PileupConfig} */
const params = {
    type: "pileup",
    start: "start",
    end: "end"
};

/**
 * @param {PileupConfig} params
 * @param {any[]} data
 */
function pileupTransform(params, data) {
    return processData(new PileupTransform(params), data);
}

test("Pileup transform produces correct pileup", () => {
    const piledUp = lanes.map((d, i) => ({
        ...reads[i],
        lane: d
    }));

    expect(pileupTransform(params, reads)).toEqual(piledUp);
});

test("Pileup transform produces correct pileup with consecutive contigs", () => {
    // Simulate data having multiple chromosomes, sorted by [chrom, pos].
    // Piling should handle suddenly decreasing start positions by freeing all
    // reserved lanes.

    const repeatedReads = [...reads, ...reads];
    const repeatedLanes = [...lanes, ...lanes];

    const piledUp = repeatedLanes.map((d, i) => ({
        ...repeatedReads[i],
        lane: d
    }));

    expect(pileupTransform(params, repeatedReads)).toEqual(piledUp);
});
