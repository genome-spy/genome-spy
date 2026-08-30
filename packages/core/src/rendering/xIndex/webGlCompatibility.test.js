import { describe, expect, test } from "vitest";
import { createVertexRangeIndexer } from "../webgl/gl/vertexRangeIndex.js";
import { XRangeIndexBuilder } from "./xRangeIndex.js";

/** @param {number[]} values */
function reader(values) {
    return (/** @type {number} */ index) => values[index];
}

describe("WebGL x-index compatibility", () => {
    test("matches representative point candidate ranges", () => {
        const values = [0, 1, 4, 10, 35, 35, 36, 80];
        const builder = new XRangeIndexBuilder([0, 100], 50);
        values.forEach((x, index) => builder.add(x, x, index, index + 1));
        const shared = builder.finish();
        const pointReader = reader(values);
        const webGl = createVertexRangeIndexer(
            50,
            [0, 100],
            pointReader,
            pointReader,
            0,
            values.length
        );

        for (const query of [
            [0, 1],
            [9, 11],
            [34, 37],
            [0, 100],
        ]) {
            expect(shared.query(query[0], query[1], [0, 0])).toEqual(
                webGl(query[0], query[1])
            );
        }
    });

    test("matches representative interval candidate ranges", () => {
        const intervals = [
            [0, 5],
            [25, 48],
            [50, 55],
            [64, 67],
            [72, 75],
            [75, 78],
            [86, 90],
            [90, 93],
        ];
        const starts = intervals.map((interval) => interval[0]);
        const ends = intervals.map((interval) => interval[1]);
        const builder = new XRangeIndexBuilder([0, 100], 50);
        intervals.forEach(([x, x2], index) =>
            builder.add(x, x2, index, index + 1)
        );
        const shared = builder.finish();
        const webGl = createVertexRangeIndexer(
            50,
            [0, 100],
            reader(starts),
            reader(ends),
            0,
            intervals.length
        );

        for (const query of [
            [0, 1],
            [15, 30],
            [69, 79],
            [80, 90],
            [0, 100],
        ]) {
            expect(shared.query(query[0], query[1], [0, 0])).toEqual(
                webGl(query[0], query[1])
            );
        }
    });
});
