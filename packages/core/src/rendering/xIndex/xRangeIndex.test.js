import { describe, expect, test } from "vitest";
import { XRangeIndexBuilder } from "./xRangeIndex.js";

/**
 * @param {number[][]} intervals
 * @param {[number, number]} [domain]
 * @param {number} [binCount]
 */
function build(intervals, domain = [0, 100], binCount = 10) {
    const builder = new XRangeIndexBuilder(domain, binCount);
    intervals.forEach(([x, x2, start, end]) => builder.add(x, x2, start, end));
    return builder.finish();
}

describe("XRangeIndexBuilder", () => {
    test("queries points using reusable target storage", () => {
        const index = build([
            [0, 0, 5, 6],
            [20, 20, 6, 7],
            [40, 40, 7, 8],
            [80, 80, 8, 9],
        ]);
        const target = /** @type {[number, number]} */ ([0, 0]);

        expect(index.query(19, 21, target)).toBe(target);
        expect(target).toEqual([6, 7]);
        expect(index.query(41, 59, target)).toEqual([7, 8]);
        expect(index.query(-1, 101, target)).toEqual([5, 9]);
    });

    test("conservatively includes long overlapping intervals", () => {
        const index = build([
            [0, 5, 10, 12],
            [0, 64, 12, 15],
            [25, 50, 15, 16],
            [80, 90, 16, 20],
        ]);

        expect(index.query(30, 31, [0, 0])).toEqual([12, 16]);
        expect(index.query(61, 63, [0, 0])).toEqual([12, 16]);
        expect(index.query(70, 75, [0, 0])).toEqual([16, 16]);
    });

    test("uses half-open bins at exact boundaries", () => {
        const index = build([
            [10, 20, 0, 1],
            [20, 30, 1, 2],
        ]);

        expect(index.query(10, 20, [0, 0])).toEqual([0, 1]);
        expect(index.query(20, 30, [0, 0])).toEqual([1, 2]);
    });

    test("supports nonzero native bases and gaps", () => {
        const index = build([
            [10, 15, 100, 103],
            [40, 45, 110, 112],
        ]);

        expect(index.query(0, 5, [0, 0])).toEqual([100, 100]);
        expect(index.query(20, 30, [0, 0])).toEqual([110, 110]);
        expect(index.query(90, 100, [0, 0])).toEqual([112, 112]);
        expect(index.query(0, 100, [0, 0])).toEqual([100, 112]);
    });

    test.each([
        [
            "unordered coordinates",
            [
                [20, 20, 0, 1],
                [10, 10, 1, 2],
            ],
        ],
        ["inverted interval", [[20, 10, 0, 1]]],
        ["non-finite coordinate", [[NaN, 10, 0, 1]]],
        [
            "overlapping native ranges",
            [
                [10, 10, 5, 8],
                [20, 20, 7, 9],
            ],
        ],
        ["negative native range", [[10, 10, -1, 0]]],
        ["non-integer native range", [[10, 10, 0.5, 1]]],
    ])("rejects %s", (_name, intervals) => {
        expect(build(intervals)).toBeUndefined();
    });

    const invalidConfigurations = /** @type {[[number, number], number][]} */ ([
        [[0, 0], 10],
        [[0, Infinity], 10],
        [[0, 100], 0],
        [[0, 100], 1.5],
    ]);

    test.each(invalidConfigurations)(
        "rejects invalid domain or bin count",
        (domain, binCount) => {
            expect(build([[10, 10, 0, 1]], domain, binCount)).toBeUndefined();
        }
    );

    test("ignores empty native spans", () => {
        expect(
            build([
                [5, 5, 0, 0],
                [10, 10, 4, 5],
            ]).query(0, 100, [0, 0])
        ).toEqual([4, 5]);
    });

    test("fails closed for an invalid query", () => {
        const index = build([
            [10, 10, 5, 6],
            [20, 20, 6, 7],
        ]);

        expect(index.query(20, 10, [0, 0])).toEqual([5, 7]);
        expect(index.query(NaN, 10, [0, 0])).toEqual([5, 7]);
    });
});
