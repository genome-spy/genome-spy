import { describe, expect, test } from "vitest";
import { parseCigar, walkCigar } from "./cigarUtils.js";

describe("CIGAR utilities", () => {
    test("parses CIGAR operations", () => {
        expect(parseCigar("10M")).toEqual([{ op: "M", length: 10 }]);
        expect(parseCigar("5S10M2I4M3D6M1S")).toEqual([
            { op: "S", length: 5 },
            { op: "M", length: 10 },
            { op: "I", length: 2 },
            { op: "M", length: 4 },
            { op: "D", length: 3 },
            { op: "M", length: 6 },
            { op: "S", length: 1 },
        ]);
        expect(parseCigar("8M100N12M")).toEqual([
            { op: "M", length: 8 },
            { op: "N", length: 100 },
            { op: "M", length: 12 },
        ]);
        expect(parseCigar("3H5S10M2P4M")).toEqual([
            { op: "H", length: 3 },
            { op: "S", length: 5 },
            { op: "M", length: 10 },
            { op: "P", length: 2 },
            { op: "M", length: 4 },
        ]);
        expect(parseCigar("4=1X5=")).toEqual([
            { op: "=", length: 4 },
            { op: "X", length: 1 },
            { op: "=", length: 5 },
        ]);
    });

    test("parses unavailable CIGAR as no operations", () => {
        expect(parseCigar("*")).toEqual([]);
        expect(Array.from(walkCigar("*", 100))).toEqual([]);
    });

    test.each(["", "M10", "10Q", "10M2"])(
        "rejects malformed CIGAR string %j",
        (cigar) => {
            expect(() => parseCigar(cigar)).toThrow(/Malformed CIGAR/);
        }
    );

    test("walks query and reference cursors using SAM CIGAR consumption rules", () => {
        expect(Array.from(walkCigar("5S10M2I4M3D6M1S", 100))).toEqual([
            {
                cigarOp: "S",
                cigarLength: 5,
                cigarStart: 100,
                cigarEnd: 100,
                readStart: 0,
                readEnd: 5,
                cigarType: "softClip",
            },
            {
                cigarOp: "M",
                cigarLength: 10,
                cigarStart: 100,
                cigarEnd: 110,
                readStart: 5,
                readEnd: 15,
                cigarType: "aligned",
            },
            {
                cigarOp: "I",
                cigarLength: 2,
                cigarStart: 110,
                cigarEnd: 110,
                readStart: 15,
                readEnd: 17,
                cigarType: "insertion",
            },
            {
                cigarOp: "M",
                cigarLength: 4,
                cigarStart: 110,
                cigarEnd: 114,
                readStart: 17,
                readEnd: 21,
                cigarType: "aligned",
            },
            {
                cigarOp: "D",
                cigarLength: 3,
                cigarStart: 114,
                cigarEnd: 117,
                readStart: 21,
                readEnd: 21,
                cigarType: "deletion",
            },
            {
                cigarOp: "M",
                cigarLength: 6,
                cigarStart: 117,
                cigarEnd: 123,
                readStart: 21,
                readEnd: 27,
                cigarType: "aligned",
            },
            {
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

    test("walks skipped, hard-clipped, padding, match, and mismatch operations", () => {
        expect(Array.from(walkCigar("8M100N12M", 50))).toEqual([
            {
                cigarOp: "M",
                cigarLength: 8,
                cigarStart: 50,
                cigarEnd: 58,
                readStart: 0,
                readEnd: 8,
                cigarType: "aligned",
            },
            {
                cigarOp: "N",
                cigarLength: 100,
                cigarStart: 58,
                cigarEnd: 158,
                readStart: 8,
                readEnd: 8,
                cigarType: "skip",
            },
            {
                cigarOp: "M",
                cigarLength: 12,
                cigarStart: 158,
                cigarEnd: 170,
                readStart: 8,
                readEnd: 20,
                cigarType: "aligned",
            },
        ]);

        expect(Array.from(walkCigar("3H5S10M2P4=1X", 10))).toEqual([
            {
                cigarOp: "H",
                cigarLength: 3,
                cigarStart: 10,
                cigarEnd: 10,
                readStart: 0,
                readEnd: 0,
                cigarType: "hardClip",
            },
            {
                cigarOp: "S",
                cigarLength: 5,
                cigarStart: 10,
                cigarEnd: 10,
                readStart: 0,
                readEnd: 5,
                cigarType: "softClip",
            },
            {
                cigarOp: "M",
                cigarLength: 10,
                cigarStart: 10,
                cigarEnd: 20,
                readStart: 5,
                readEnd: 15,
                cigarType: "aligned",
            },
            {
                cigarOp: "P",
                cigarLength: 2,
                cigarStart: 20,
                cigarEnd: 20,
                readStart: 15,
                readEnd: 15,
                cigarType: "padding",
            },
            {
                cigarOp: "=",
                cigarLength: 4,
                cigarStart: 20,
                cigarEnd: 24,
                readStart: 15,
                readEnd: 19,
                cigarType: "aligned",
            },
            {
                cigarOp: "X",
                cigarLength: 1,
                cigarStart: 24,
                cigarEnd: 25,
                readStart: 19,
                readEnd: 20,
                cigarType: "aligned",
            },
        ]);
    });
});
