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
    test("Creates context with flattened rows", () => {
        const datum = {
            sample: "S1",
            nested: { value: 42, deeper: { leaf: "ok" } },
            _internal: 1,
        };

        const context = createTooltipContext(datum, makeMark({ encoders: {} }));

        expect(context.getRows?.()).toEqual([
            { key: "sample", value: "S1" },
            { key: "nested.value", value: 42 },
            { key: "nested.deeper.leaf", value: "ok" },
        ]);

        expect(context.getGenomicRows?.()).toEqual([]);
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

        expect(context.getGenomicRows?.()).toEqual([
            { key: "locus", value: "chr1:11" },
        ]);
    });

    test("Auto mode renders an interval row for two coordinates in the same group", () => {
        const datum = {
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

        expect(context.getGenomicRows?.()).toEqual([
            { key: "interval", value: "chr1:11-20" },
        ]);
    });

    test("Auto mode renders endpoint rows for coordinates in different groups", () => {
        const datum = {
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

        expect(context.getGenomicRows?.()).toEqual([
            { key: "endpoint 1", value: "chr1:11" },
            { key: "endpoint 2", value: "chr2:6" },
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

        expect(context.getGenomicRows?.()).toEqual([]);
    });
});
