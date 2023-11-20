import { expect, test } from "vitest";
import PileupTransform from "./pileup.js";
import { processData } from "../flowTestUtils.js";

// TODO: Test for lane preferences

/**
 * @typedef {import("../../spec/transform.js").PileupParams} PileupParams
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
    [17, 18],
].map((d) => ({
    start: d[0],
    end: d[1],
}));

const lanes = [0, 1, 2, 1, 0, 0, 1, 2, 0, 1, 2];

/** @type {PileupParams} */
const params = {
    type: "pileup",
    start: "start",
    end: "end",
};

/**
 * @param {PileupParams} params
 * @param {any[]} data
 */
function pileupTransform(params, data) {
    const t = new PileupTransform(params);
    t.initialize();
    return processData(t, data);
}

test("Pileup transform produces correct pileup", () => {
    const piledUp = lanes.map((d, i) => ({
        ...reads[i],
        lane: d,
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
        lane: d,
    }));

    expect(pileupTransform(params, repeatedReads)).toEqual(piledUp);
});
