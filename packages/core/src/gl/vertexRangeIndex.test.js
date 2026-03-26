import { describe, expect, test } from "vitest";
import { createVertexRangeIndexer } from "./vertexRangeIndex.js";
import { HIGH_PRECISION_SPLIT_BASE } from "./glslScaleGenerator.js";

/**
 * @param {Float32Array | Uint32Array} values
 */
function makeScalarReader(values) {
    /** @type {(vertexIndex: number) => number} */
    const reader = (vertexIndex) => values[vertexIndex];
    return reader;
}

/**
 * @param {Uint32Array} values
 */
function makeSplitReader(values) {
    // Decode the split high-precision format used by large genomic coordinates.
    /** @type {(vertexIndex: number) => number} */
    const reader = (vertexIndex) => {
        const base = vertexIndex * 2;
        return values[base] * HIGH_PRECISION_SPLIT_BASE + values[base + 1];
    };
    return reader;
}

describe("vertexRangeIndex", () => {
    test("collapses repeated vertex runs into a single visible range", () => {
        const x = new Float32Array([10, 10, 10, 20, 20, 20]);
        const x2 = new Float32Array([12, 12, 12, 22, 22, 22]);

        const lookup = createVertexRangeIndexer(
            10,
            [0, 100],
            makeScalarReader(x),
            makeScalarReader(x2),
            0,
            x.length
        );

        expect(lookup(11, 12)).toEqual([0, 3]);
        expect(lookup(21, 22)).toEqual([3, 6]);
    });

    test("returns an empty span for a query that misses all runs", () => {
        const x = new Float32Array([0, 0, 5, 5, 20, 20]);
        const x2 = new Float32Array([1, 1, 6, 6, 21, 21]);

        const lookup = createVertexRangeIndexer(
            10,
            [0, 100],
            makeScalarReader(x),
            makeScalarReader(x2),
            0,
            x.length
        );

        expect(lookup(50, 60)).toEqual([2147483647, 2147483647]);
    });

    test("decodes split high-precision vertex values", () => {
        const x = new Uint32Array([1, 0, 1, 0, 2, 0, 2, 0]);
        const x2 = new Uint32Array([1, 1, 1, 1, 2, 1, 2, 1]);

        const lookup = createVertexRangeIndexer(
            10,
            [0, 10000],
            makeSplitReader(x),
            makeSplitReader(x2),
            0,
            4
        );

        expect(lookup(4096, 4097)).toEqual([0, 2]);
        expect(lookup(8192, 8193)).toEqual([2, 4]);
    });
});
