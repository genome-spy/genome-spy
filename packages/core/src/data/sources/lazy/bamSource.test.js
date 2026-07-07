import { describe, expect, test } from "vitest";
import { createBamReadDatum } from "./bamSource.js";

describe("BamSource", () => {
    test("maps a BAM record to a read-level datum", () => {
        const record = {
            start: 100,
            end: 125,
            name: "read1",
            CIGAR: "10M2I13M",
            mq: 60,
            strand: 1,
            seq: "ACGT",
            qual: Uint8Array.from([30, 31, 32, 33]),
            flags: 99,
            getTag: (tag) => (tag == "MD" ? "10A13" : undefined),
            isPaired: () => true,
            isProperlyPaired: () => true,
            isDuplicate: () => false,
            isFailedQc: () => false,
            isSecondary: () => false,
            isSupplementary: () => false,
        };

        expect(createBamReadDatum("chr1", record)).toEqual({
            chrom: "chr1",
            start: 100,
            end: 125,
            name: "read1",
            cigar: "10M2I13M",
            mapq: 60,
            strand: "+",
            seq: "ACGT",
            qual: [30, 31, 32, 33],
            md: "10A13",
            flags: 99,
            isPaired: true,
            isProperPair: true,
            isDuplicate: false,
            isQcFail: false,
            isSecondary: false,
            isSupplementary: false,
        });
    });

    test("maps reverse strand and missing mapping quality", () => {
        const record = {
            start: 50,
            end: 60,
            name: "read2",
            CIGAR: "10M",
            mq: undefined,
            strand: -1,
            seq: "ACGT",
            qual: undefined,
            flags: 16,
            getTag: () => undefined,
            isPaired: () => false,
            isProperlyPaired: () => false,
            isDuplicate: () => false,
            isFailedQc: () => false,
            isSecondary: () => false,
            isSupplementary: () => false,
        };

        expect(createBamReadDatum("chr2", record)).toMatchObject({
            chrom: "chr2",
            mapq: undefined,
            strand: "-",
            qual: undefined,
            md: undefined,
            flags: 16,
            isPaired: false,
        });
    });

    test("normalizes empty BAM CIGAR to SAM unavailable CIGAR", () => {
        const record = {
            start: 50,
            end: 50,
            name: "read-without-cigar",
            CIGAR: "",
            mq: undefined,
            strand: 1,
            seq: "",
            qual: undefined,
            flags: 4,
            getTag: () => undefined,
            isPaired: () => false,
            isProperlyPaired: () => false,
            isDuplicate: () => false,
            isFailedQc: () => false,
            isSecondary: () => false,
            isSupplementary: () => false,
        };

        expect(createBamReadDatum("chr1", record)).toMatchObject({
            cigar: "*",
        });
    });
});
