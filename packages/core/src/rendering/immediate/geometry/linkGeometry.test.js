import { describe, expect, test } from "vitest";
import { getBezierPoints } from "./linkGeometry.js";

const viewport = { width: 100, height: 100 };
const defaults = {
    shape: /** @type {const} */ ("arc"),
    orient: /** @type {const} */ ("vertical"),
    arcHeightFactor: 1,
    minArcHeight: 1.5,
    maxChordLength: 50_000,
    clampApex: false,
};

describe("link geometry", () => {
    test("computes arc control points using the shader approximation", () => {
        expect(getBezierPoints([20, 20], [80, 20], viewport, defaults)).toEqual(
            [
                [20, 20],
                [20, 60],
                [80, 60],
                [80, 20],
            ]
        );
    });

    test("computes dome, diagonal, and line control points", () => {
        expect(
            getBezierPoints([20, 20], [80, 80], viewport, {
                ...defaults,
                shape: "dome",
            })
        ).toEqual([
            [20, 80],
            [20, 0],
            [80, 0],
            [80, 80],
        ]);
        expect(
            getBezierPoints([20, 20], [80, 80], viewport, {
                ...defaults,
                shape: "diagonal",
            })
        ).toEqual([
            [20, 20],
            [20, 50],
            [80, 50],
            [80, 80],
        ]);
        expect(
            getBezierPoints([20, 20], [80, 80], viewport, {
                ...defaults,
                shape: "line",
            })
        ).toEqual([
            [20, 20],
            [50, 50],
            [50, 50],
            [80, 80],
        ]);
    });

    test("clamps long chords near the viewport", () => {
        expect(
            getBezierPoints([10, 50], [1000, 50], viewport, {
                ...defaults,
                maxChordLength: 100,
            })
        ).toEqual([
            [10, 50],
            [10, 116.66666666666667],
            [110, 116.66666666666667],
            [110, 50],
        ]);
    });
});
