import { describe, expect, test } from "vitest";
import Genome from "../genome/genome.js";
import createTooltipContext from "./tooltipContext.js";

const genome = new Genome({
    name: "test",
    contigs: [
        { name: "chr1", size: 100 },
        { name: "chr2", size: 100 },
    ],
});

/**
 * @param {string} field
 */
function makeAccessor(field) {
    const accessor = (/** @type {Record<string, any>} */ datum) => datum[field];
    accessor.fields = [field];
    return accessor;
}

/**
 * @param {string} field
 */
function makeLocusEncoder(field) {
    return {
        scale: {
            type: "locus",
            genome: () => genome,
        },
        dataAccessor: makeAccessor(field),
    };
}

/**
 * @param {object} options
 * @param {Record<string, any>} options.encoders
 * @param {any} [options.parent]
 */
function makeMark({ encoders, parent }) {
    return /** @type {any} */ ({
        encoders,
        unitView: {
            getCollector: () => ({
                parent,
            }),
        },
    });
}

describe("Tooltip context rows", () => {
    test("Creates context with datum row flattening utility", () => {
        const datum = {
            sample: "S1",
            nested: { value: 42, deeper: { leaf: "ok" } },
            _internal: 1,
        };

        const context = createTooltipContext(datum, makeMark({ encoders: {} }));

        expect(context.flattenDatumRows?.()).toEqual([
            { key: "sample", value: "S1" },
            { key: "nested.value", value: 42 },
            { key: "nested.deeper.leaf", value: "ok" },
        ]);

        expect(context.genomicRows).toEqual([]);
        expect(context.hiddenRowKeys).toEqual([]);
    });

    test("Auto mode renders a locus row for a single coordinate", () => {
        const datum = {
            linearizedX: 10,
        };

        const mark = makeMark({
            encoders: {
                x: makeLocusEncoder("linearizedX"),
            },
            parent: {
                params: {
                    type: "linearizeGenomicCoordinate",
                    chrom: "chrom",
                    pos: "start",
                    as: "linearizedX",
                },
            },
        });

        const context = createTooltipContext(datum, mark);

        expect(context.genomicRows).toEqual([
            { key: "Coordinate", value: "chr1:11" },
        ]);
    });

    test("Auto mode renders an interval row for two coordinates in the same group", () => {
        const datum = {
            chrom: "chr1",
            start: 10,
            end: 20,
            linearizedStart: 10,
            linearizedEnd: 20,
        };

        const mark = makeMark({
            encoders: {
                x: makeLocusEncoder("linearizedStart"),
                x2: makeLocusEncoder("linearizedEnd"),
            },
            parent: {
                params: {
                    type: "linearizeGenomicCoordinate",
                    chrom: "chrom",
                    pos: ["start", "end"],
                    as: ["linearizedStart", "linearizedEnd"],
                },
            },
        });

        const context = createTooltipContext(datum, mark);

        expect(context.genomicRows).toEqual([
            { key: "Interval", value: "chr1:11-20" },
        ]);
        expect(context.hiddenRowKeys).toEqual(["chrom", "start", "end"]);
    });

    test("Auto mode renders endpoint rows for coordinates in different groups", () => {
        const datum = {
            chrom1: "chr1",
            start1: 10,
            end1: 12,
            chrom2: "chr2",
            start2: 5,
            end2: 9,
            linearizedA: 10,
            linearizedB: 105,
        };

        const mark = makeMark({
            encoders: {
                x: makeLocusEncoder("linearizedA"),
                x2: makeLocusEncoder("linearizedB"),
            },
            parent: {
                params: {
                    type: "linearizeGenomicCoordinate",
                    chrom: "chrom2",
                    pos: "start2",
                    as: "linearizedB",
                },
                parent: {
                    params: {
                        type: "linearizeGenomicCoordinate",
                        chrom: "chrom1",
                        pos: "start1",
                        as: "linearizedA",
                    },
                },
            },
        });

        const context = createTooltipContext(datum, mark);

        expect(context.genomicRows).toEqual([
            { key: "Endpoint 1", value: "chr1:11" },
            { key: "Endpoint 2", value: "chr2:6" },
        ]);
        expect(context.hiddenRowKeys).toEqual([
            "chrom1",
            "start1",
            "chrom2",
            "start2",
        ]);
    });

    test("Endpoint rows follow source endpoint numbering hints", () => {
        const datum = {
            chrom1: "chr1",
            start1: 10,
            chrom2: "chr2",
            start2: 5,
            linearizedA: 10,
            linearizedB: 105,
        };

        const mark = makeMark({
            encoders: {
                // Reversed encoder order: x is endpoint 2 and x2 is endpoint 1.
                x: makeLocusEncoder("linearizedB"),
                x2: makeLocusEncoder("linearizedA"),
            },
            parent: {
                params: {
                    type: "linearizeGenomicCoordinate",
                    chrom: "chrom2",
                    pos: "start2",
                    as: "linearizedB",
                },
                parent: {
                    params: {
                        type: "linearizeGenomicCoordinate",
                        chrom: "chrom1",
                        pos: "start1",
                        as: "linearizedA",
                    },
                },
            },
        });

        const context = createTooltipContext(datum, mark);

        expect(context.genomicRows).toEqual([
            { key: "Endpoint 1", value: "chr1:11" },
            { key: "Endpoint 2", value: "chr2:6" },
        ]);
    });

    test("Disabled mode turns off genomic row generation", () => {
        const datum = {
            linearizedX: 10,
            linearizedY: 20,
        };

        const mark = makeMark({
            encoders: {
                x: makeLocusEncoder("linearizedX"),
                x2: makeLocusEncoder("linearizedY"),
            },
        });

        const context = createTooltipContext(datum, mark, {
            genomicCoordinates: {
                x: { mode: "disabled" },
            },
        });

        expect(context.genomicRows).toEqual([]);
    });

    test("Keeps raw fields visible when verified mapping check fails", () => {
        const datum = {
            chrom: "chr1",
            start: 10,
            linearizedX: 999,
        };

        const mark = makeMark({
            encoders: {
                x: makeLocusEncoder("linearizedX"),
            },
            parent: {
                params: {
                    type: "linearizeGenomicCoordinate",
                    chrom: "chrom",
                    pos: "start",
                    as: "linearizedX",
                },
            },
        });

        const context = createTooltipContext(datum, mark);

        expect(context.genomicRows).toEqual([
            { key: "Coordinate", value: "999" },
        ]);
        expect(context.hiddenRowKeys).toEqual([]);
    });

    test("Keeps raw fields visible when mapping is ambiguous", () => {
        const datum = {
            chrom: "chr1",
            start: 10,
            linearizedX: 10,
        };

        const mark = makeMark({
            encoders: {
                x: makeLocusEncoder("linearizedX"),
            },
            parent: {
                params: {
                    type: "linearizeGenomicCoordinate",
                    chrom: "chrom",
                    pos: "start",
                    as: "linearizedX",
                },
                parent: {
                    params: {
                        type: "linearizeGenomicCoordinate",
                        chrom: "chrom",
                        pos: "start",
                        as: "linearizedX",
                    },
                },
            },
        });

        const context = createTooltipContext(datum, mark);

        expect(context.genomicRows).toEqual([
            { key: "Coordinate", value: "chr1:11" },
        ]);
        expect(context.hiddenRowKeys).toEqual([]);
    });

    test("Auto mode defaults to interval when grouping cannot be inferred", () => {
        const datum = {
            linearizedStart: 10,
            linearizedEnd: 20,
        };

        const mark = makeMark({
            encoders: {
                x: makeLocusEncoder("linearizedStart"),
                x2: makeLocusEncoder("linearizedEnd"),
            },
        });

        const context = createTooltipContext(datum, mark);

        expect(context.genomicRows).toEqual([
            { key: "Interval", value: "chr1:11-20" },
        ]);
    });

    test("Prefixes genomic row labels with axis when both axes are genomic", () => {
        const datum = {
            linearizedX: 10,
            linearizedY: 120,
        };

        const mark = makeMark({
            encoders: {
                x: makeLocusEncoder("linearizedX"),
                y: makeLocusEncoder("linearizedY"),
            },
        });

        const context = createTooltipContext(datum, mark);

        expect(context.genomicRows).toEqual([
            { key: "X Coordinate", value: "chr1:11" },
            { key: "Y Coordinate", value: "chr2:21" },
        ]);
    });

    test("Fails fast on unknown genomic coordinate display mode", () => {
        expect(() =>
            createTooltipContext(
                { linearizedX: 10 },
                makeMark({
                    encoders: {
                        x: makeLocusEncoder("linearizedX"),
                    },
                }),
                {
                    genomicCoordinates: {
                        x: /** @type {any} */ ({ mode: "banana" }),
                    },
                }
            )
        ).toThrow('Unknown genomic coordinate display mode: "banana"');
    });
});
