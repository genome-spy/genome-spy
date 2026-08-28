import { describe, expect, test } from "vitest";
import { solveDisplacement } from "./displace2dSolver.js";

/**
 * @param {number[]} xPositions
 * @param {number[]} yPositions
 * @param {number[]} widths
 * @param {number[]} heights
 * @param {{ x: number[], y: number[] }} displacements
 */
function expectNoOverlap(
    xPositions,
    yPositions,
    widths,
    heights,
    displacements
) {
    for (let i = 0; i < xPositions.length; i++) {
        for (let j = 0; j < i; j++) {
            const overlap =
                widths[i] > 0 &&
                heights[i] > 0 &&
                widths[j] > 0 &&
                heights[j] > 0 &&
                Math.abs(
                    xPositions[i] +
                        displacements.x[i] -
                        (xPositions[j] + displacements.x[j])
                ) *
                    2 <
                    widths[i] + widths[j] &&
                Math.abs(
                    yPositions[i] +
                        displacements.y[i] -
                        (yPositions[j] + displacements.y[j])
                ) *
                    2 <
                    heights[i] + heights[j];

            expect(overlap).toBe(false);
        }
    }
}

describe("solveDisplacement", () => {
    test("keeps already separated rectangles in place", () => {
        expect(
            solveDisplacement([0, 10, 20], [0, 10, 0], [4, 6, 4], [4, 6, 4])
        ).toEqual({ x: [0, 0, 0], y: [0, 0, 0] });
    });

    test("deterministically separates coincident variable-size rectangles", () => {
        const xPositions = [0, 0, 0, 0];
        const yPositions = [0, 0, 0, 0];
        const widths = [8, 4, 6, 2];
        const heights = [2, 6, 4, 8];
        const first = solveDisplacement(
            xPositions,
            yPositions,
            widths,
            heights
        );
        const second = solveDisplacement(
            xPositions,
            yPositions,
            widths,
            heights
        );

        expect(first).toEqual(second);
        expectNoOverlap(xPositions, yPositions, widths, heights, first);
    });

    test("allows touching edges and empty collision rectangles", () => {
        expect(
            solveDisplacement([0, 10, 0], [0, 0, 0], [10, 10, 0], [10, 10, 10])
        ).toEqual({ x: [0, 0, 0], y: [0, 0, 0] });
    });

    test("clamps edge items into feasible preferred extents", () => {
        const displacements = solveDisplacement(
            [-10, 5, 20],
            [5, 5, 5],
            [2, 2, 2],
            [2, 2, 2],
            [0, 10],
            [0, 10]
        );

        expect(displacements).toEqual({ x: [11, 0, -11], y: [0, 0, 0] });
        expectNoOverlap(
            [-10, 5, 20],
            [5, 5, 5],
            [2, 2, 2],
            [2, 2, 2],
            displacements
        );
    });

    test("uses a right-side overflow row after exhausting local candidates", () => {
        const count = 86;
        const xPositions = Array(count).fill(0);
        const yPositions = Array(count).fill(0);
        const widths = Array(count).fill(2);
        const heights = Array(count).fill(2);
        const displacements = solveDisplacement(
            xPositions,
            yPositions,
            widths,
            heights
        );

        const lastLeft =
            xPositions.at(-1) + displacements.x.at(-1) - widths.at(-1) / 2;
        const previousRight = Math.max(
            ...xPositions
                .slice(0, -1)
                .map((x, i) => x + displacements.x[i] + widths[i] / 2)
        );

        expect(lastLeft).toBe(previousRight);
        expect(displacements.y.at(-1)).toBe(0);
        expectNoOverlap(xPositions, yPositions, widths, heights, displacements);
    });

    test("overflows an oversized rectangle without dropping it", () => {
        const displacements = solveDisplacement(
            [5],
            [5],
            [12],
            [12],
            [0, 10],
            [0, 10]
        );

        expect(displacements).toEqual({ x: [12], y: [0] });
    });

    test("optionally reuses output arrays", () => {
        const output = { x: [NaN], y: [NaN] };

        expect(
            solveDisplacement(
                [0],
                [0],
                [2],
                [2],
                undefined,
                undefined,
                undefined,
                output
            )
        ).toBe(output);
        expect(output).toEqual({ x: [0], y: [0] });
    });

    test("keeps valid previous placements instead of snapping to the origin", () => {
        const displacements = solveDisplacement(
            [0, 20],
            [0, 0],
            [10, 10],
            [10, 10],
            undefined,
            undefined,
            { x: [0, 0], y: [0, -10] }
        );

        expect(displacements).toEqual({ x: [0, 0], y: [0, -10] });
        expectNoOverlap([0, 20], [0, 0], [10, 10], [10, 10], displacements);
    });

    test("projects an invalid previous placement to the nearest collision edge", () => {
        const displacements = solveDisplacement(
            [0, 0],
            [-20, 0],
            [10, 10],
            [10, 10],
            undefined,
            undefined,
            { x: [0, 0], y: [0, -20] }
        );

        expect(displacements).toEqual({ x: [0, -10], y: [0, -20] });
        expectNoOverlap([0, 0], [-20, 0], [10, 10], [10, 10], displacements);
    });

    test("clamps previous placements to changed extents", () => {
        expect(
            solveDisplacement([0], [0], [10], [10], [-20, 20], [-20, 20], {
                x: [18],
                y: [-18],
            })
        ).toEqual({ x: [15], y: [-15] });
    });

    test("rejects invalid previous placement input", () => {
        expect(() =>
            solveDisplacement([0], [0], [1], [1], undefined, undefined, {
                x: [],
                y: [],
            })
        ).toThrow("previous placements");
        expect(() =>
            solveDisplacement([0], [0], [1], [1], undefined, undefined, {
                x: [0],
                y: [undefined],
            })
        ).toThrow("finite offset pairs");
    });

    test("rejects placements outside the finite numeric range", () => {
        expect(() =>
            solveDisplacement(
                [Number.MAX_VALUE],
                [0],
                [Number.MAX_VALUE],
                [1],
                [0, 1]
            )
        ).toThrow("finite numeric range");
    });

    test("detects overlaps without overflowing finite dimensions", () => {
        const width = 1.5e308;
        const displacements = solveDisplacement(
            [0, 1e308],
            [0, 0],
            [width, width],
            [1, 1]
        );

        expect(displacements).toEqual({ x: [0, 0], y: [0, -1] });
    });

    test.each([
        [[NaN], [0], [1], [1], "positions"],
        [[0], [0], [Infinity], [1], "dimensions"],
        [[0], [0], [1], [-1], "dimensions"],
        [[0, 1], [0], [1, 1], [1, 1], "same number"],
    ])(
        "rejects invalid rectangle input %#",
        (xPositions, yPositions, widths, heights, message) => {
            expect(() =>
                solveDisplacement(xPositions, yPositions, widths, heights)
            ).toThrow(message);
        }
    );

    test.each([
        ["xExtent", [NaN, 1], undefined],
        ["xExtent", [1, 0], undefined],
        ["yExtent", undefined, [0, Infinity]],
    ])("rejects invalid %s", (name, xExtent, yExtent) => {
        expect(() =>
            solveDisplacement([0], [0], [1], [1], xExtent, yExtent)
        ).toThrow(name);
    });
});
