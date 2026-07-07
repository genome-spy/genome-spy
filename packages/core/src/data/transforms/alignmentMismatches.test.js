import { describe, expect, test } from "vitest";
import { processData } from "../flowTestUtils.js";
import AlignmentMismatchesTransform from "./alignmentMismatches.js";

/**
 * @typedef {import("../../spec/transform.js").AlignmentMismatchesParams} AlignmentMismatchesParams
 */

/**
 * @param {AlignmentMismatchesParams} params
 * @param {any[]} data
 */
function transform(params, data) {
    return processData(new AlignmentMismatchesTransform(params), data);
}

describe("AlignmentMismatches transform", () => {
    test("emits one cloned row per MD mismatch in an M operation", () => {
        /** @type {AlignmentMismatchesParams} */
        const params = { type: "alignmentMismatches" };
        const data = [
            {
                chrom: "chr1",
                start: 100,
                end: 110,
                name: "read1",
                cigar: "10M",
                seq: "AAAATAAAAA",
                qual: [30, 30, 30, 30, 17, 30, 30, 30, 30, 30],
                md: "4A5",
                _lane: 2,
            },
        ];

        expect(transform(params, data)).toEqual([
            {
                chrom: "chr1",
                start: 100,
                end: 110,
                name: "read1",
                cigar: "10M",
                seq: "AAAATAAAAA",
                qual: [30, 30, 30, 30, 17, 30, 30, 30, 30, 30],
                md: "4A5",
                _lane: 2,
                mismatchStart: 104,
                mismatchEnd: 105,
                readOffset: 4,
                base: "T",
                refBase: "A",
                baseQuality: 17,
            },
        ]);
    });

    test("computes offsets across soft clips, insertions, and deletions", () => {
        /** @type {AlignmentMismatchesParams} */
        const params = { type: "alignmentMismatches" };
        const seq = Array(28).fill("A");
        seq[8] = "T";
        seq[19] = "A";
        seq[24] = "G";
        const qual = Array.from({ length: 28 }, (_, i) => i);
        const data = [
            {
                chrom: "chr1",
                start: 100,
                end: 123,
                name: "read2",
                cigar: "5S10M2I4M3D6M1S",
                seq: seq.join(""),
                qual,
                md: "3A8C1^GTA3T2",
                _lane: 4,
            },
        ];

        expect(transform(params, data)).toEqual([
            {
                chrom: "chr1",
                start: 100,
                end: 123,
                name: "read2",
                cigar: "5S10M2I4M3D6M1S",
                seq: seq.join(""),
                qual,
                md: "3A8C1^GTA3T2",
                _lane: 4,
                mismatchStart: 103,
                mismatchEnd: 104,
                readOffset: 8,
                base: "T",
                refBase: "A",
                baseQuality: 8,
            },
            {
                chrom: "chr1",
                start: 100,
                end: 123,
                name: "read2",
                cigar: "5S10M2I4M3D6M1S",
                seq: seq.join(""),
                qual,
                md: "3A8C1^GTA3T2",
                _lane: 4,
                mismatchStart: 112,
                mismatchEnd: 113,
                readOffset: 19,
                base: "A",
                refBase: "C",
                baseQuality: 19,
            },
            {
                chrom: "chr1",
                start: 100,
                end: 123,
                name: "read2",
                cigar: "5S10M2I4M3D6M1S",
                seq: seq.join(""),
                qual,
                md: "3A8C1^GTA3T2",
                _lane: 4,
                mismatchStart: 120,
                mismatchEnd: 121,
                readOffset: 24,
                base: "G",
                refBase: "T",
                baseQuality: 24,
            },
        ]);
    });

    test("emits explicit X operation mismatches with MD reference bases", () => {
        /** @type {AlignmentMismatchesParams} */
        const params = { type: "alignmentMismatches" };
        const data = [
            {
                chrom: "chr1",
                start: 200,
                cigar: "4=1X5=",
                seq: "AAAATAAAAA",
                md: "4A5",
            },
        ];

        expect(transform(params, data)).toEqual([
            {
                chrom: "chr1",
                start: 200,
                cigar: "4=1X5=",
                seq: "AAAATAAAAA",
                md: "4A5",
                mismatchStart: 204,
                mismatchEnd: 205,
                readOffset: 4,
                base: "T",
                refBase: "A",
            },
        ]);
    });

    test("does not emit rows for MD deletions", () => {
        /** @type {AlignmentMismatchesParams} */
        const params = { type: "alignmentMismatches" };
        const data = [
            {
                start: 10,
                cigar: "5M3D5M",
                seq: "AAAAAAAAAA",
                md: "5^ACG5",
            },
        ];

        expect(transform(params, data)).toEqual([]);
    });

    test("requires sequence only when a mismatch row is emitted", () => {
        /** @type {AlignmentMismatchesParams} */
        const params = { type: "alignmentMismatches" };

        expect(
            transform(params, [{ start: 0, cigar: "10M", md: "10" }])
        ).toEqual([]);
        expect(() =>
            transform(params, [{ start: 0, cigar: "10M", md: "4A5" }])
        ).toThrow(/sequence/);
    });

    test("fails loudly for missing MD and unavailable CIGARs", () => {
        /** @type {AlignmentMismatchesParams} */
        const params = { type: "alignmentMismatches" };

        expect(() =>
            transform(params, [{ start: 0, cigar: "10M", seq: "AAAAAAAAAA" }])
        ).toThrow(/MD tag/);
        expect(transform(params, [{ start: 0, cigar: "*" }])).toEqual([]);
    });
});
