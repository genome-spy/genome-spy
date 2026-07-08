import { describe, expect, test } from "vitest";
import { processData } from "../flowTestUtils.js";
import FlattenCigarTransform from "./flattenCigar.js";

/**
 * @typedef {import("../../spec/transform.js").FlattenCigarParams} FlattenCigarParams
 */

/**
 * @param {FlattenCigarParams} params
 * @param {any[]} data
 */
function transform(params, data) {
    return processData(new FlattenCigarTransform(params), data);
}

describe("FlattenCigar transform", () => {
    test("emits one cloned row per CIGAR operation", () => {
        /** @type {FlattenCigarParams} */
        const params = { type: "flattenCigar" };
        const data = [
            {
                chrom: "chr1",
                start: 100,
                end: 123,
                name: "read1",
                cigar: "5S10M2I4M3D6M1S",
                _lane: 2,
            },
        ];

        expect(transform(params, data)).toEqual([
            {
                chrom: "chr1",
                start: 100,
                end: 123,
                name: "read1",
                cigar: "5S10M2I4M3D6M1S",
                _lane: 2,
                cigarOp: "S",
                cigarLength: 5,
                cigarStart: 100,
                cigarEnd: 100,
                readStart: 0,
                readEnd: 5,
                cigarType: "softClip",
            },
            {
                chrom: "chr1",
                start: 100,
                end: 123,
                name: "read1",
                cigar: "5S10M2I4M3D6M1S",
                _lane: 2,
                cigarOp: "M",
                cigarLength: 10,
                cigarStart: 100,
                cigarEnd: 110,
                readStart: 5,
                readEnd: 15,
                cigarType: "aligned",
            },
            {
                chrom: "chr1",
                start: 100,
                end: 123,
                name: "read1",
                cigar: "5S10M2I4M3D6M1S",
                _lane: 2,
                cigarOp: "I",
                cigarLength: 2,
                cigarStart: 110,
                cigarEnd: 110,
                readStart: 15,
                readEnd: 17,
                cigarType: "insertion",
            },
            {
                chrom: "chr1",
                start: 100,
                end: 123,
                name: "read1",
                cigar: "5S10M2I4M3D6M1S",
                _lane: 2,
                cigarOp: "M",
                cigarLength: 4,
                cigarStart: 110,
                cigarEnd: 114,
                readStart: 17,
                readEnd: 21,
                cigarType: "aligned",
            },
            {
                chrom: "chr1",
                start: 100,
                end: 123,
                name: "read1",
                cigar: "5S10M2I4M3D6M1S",
                _lane: 2,
                cigarOp: "D",
                cigarLength: 3,
                cigarStart: 114,
                cigarEnd: 117,
                readStart: 21,
                readEnd: 21,
                cigarType: "deletion",
            },
            {
                chrom: "chr1",
                start: 100,
                end: 123,
                name: "read1",
                cigar: "5S10M2I4M3D6M1S",
                _lane: 2,
                cigarOp: "M",
                cigarLength: 6,
                cigarStart: 117,
                cigarEnd: 123,
                readStart: 21,
                readEnd: 27,
                cigarType: "aligned",
            },
            {
                chrom: "chr1",
                start: 100,
                end: 123,
                name: "read1",
                cigar: "5S10M2I4M3D6M1S",
                _lane: 2,
                cigarOp: "S",
                cigarLength: 1,
                cigarStart: 123,
                cigarEnd: 123,
                readStart: 27,
                readEnd: 28,
                cigarType: "softClip",
            },
        ]);
    });

    test("uses configured start and CIGAR fields", () => {
        /** @type {FlattenCigarParams} */
        const params = {
            type: "flattenCigar",
            start: "alignmentStart",
            cigar: "alignmentCigar",
        };
        const data = [
            {
                alignmentStart: 50,
                alignmentCigar: "8M100N12M",
                id: "read2",
            },
        ];

        expect(transform(params, data)).toEqual([
            {
                alignmentStart: 50,
                alignmentCigar: "8M100N12M",
                id: "read2",
                cigarOp: "M",
                cigarLength: 8,
                cigarStart: 50,
                cigarEnd: 58,
                readStart: 0,
                readEnd: 8,
                cigarType: "aligned",
            },
            {
                alignmentStart: 50,
                alignmentCigar: "8M100N12M",
                id: "read2",
                cigarOp: "N",
                cigarLength: 100,
                cigarStart: 58,
                cigarEnd: 158,
                readStart: 8,
                readEnd: 8,
                cigarType: "skip",
            },
            {
                alignmentStart: 50,
                alignmentCigar: "8M100N12M",
                id: "read2",
                cigarOp: "M",
                cigarLength: 12,
                cigarStart: 158,
                cigarEnd: 170,
                readStart: 8,
                readEnd: 20,
                cigarType: "aligned",
            },
        ]);
    });

    test("copies only configured source fields to emitted rows", () => {
        /** @type {FlattenCigarParams} */
        const params = {
            type: "flattenCigar",
            copyFields: ["start", "end", "cigar"],
        };
        const data = [
            {
                start: 10,
                end: 15,
                cigar: "5M",
                seq: "AAAAA",
                qual: [30, 30, 30, 30, 30],
            },
        ];

        expect(transform(params, data)).toEqual([
            {
                start: 10,
                end: 15,
                cigar: "5M",
                cigarOp: "M",
                cigarLength: 5,
                cigarStart: 10,
                cigarEnd: 15,
                readStart: 0,
                readEnd: 5,
                cigarType: "aligned",
            },
        ]);
    });

    test("emits no rows for unavailable CIGARs", () => {
        /** @type {FlattenCigarParams} */
        const params = { type: "flattenCigar" };

        expect(
            transform(params, [{ chrom: "chr1", start: 100, cigar: "*" }])
        ).toEqual([]);
    });

    test("fails loudly for malformed CIGARs and invalid starts", () => {
        /** @type {FlattenCigarParams} */
        const params = { type: "flattenCigar" };

        expect(() => transform(params, [{ start: 0, cigar: "10Q" }])).toThrow(
            /Malformed CIGAR/
        );
        expect(() => transform(params, [{ start: NaN, cigar: "10M" }])).toThrow(
            /Invalid CIGAR start/
        );
    });
});
