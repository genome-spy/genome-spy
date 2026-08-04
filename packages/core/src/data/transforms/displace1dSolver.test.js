import { describe, expect, test } from "vitest";
import { solveDisplacement } from "./displace1dSolver.js";

/**
 * @param {number[]} positions
 * @param {number[]} lengths
 * @param {number[]} displacements
 */
function expectNoOverlap(positions, lengths, displacements) {
    for (let i = 1; i < positions.length; i++) {
        const separation =
            positions[i] +
            displacements[i] -
            (positions[i - 1] + displacements[i - 1]);
        expect(separation).toBeGreaterThanOrEqual(
            (lengths[i - 1] + lengths[i]) / 2
        );
    }
}

describe("solveDisplacement", () => {
    test("keeps already separated items in place", () => {
        expect(solveDisplacement([0, 3, 8], [2, 2, 4])).toEqual([0, 0, 0]);
    });

    test("resolves a two-item collision symmetrically", () => {
        expect(solveDisplacement([0, 0], [2, 2])).toEqual([-1, 1]);
    });

    test("finds the least-squares placement for a cluster", () => {
        expect(solveDisplacement([0, 1, 2], [2, 2, 2])).toEqual([-1, 0, 1]);
    });

    test("supports variable collision lengths and caller-provided padding", () => {
        const positions = [0, 1, 3, 8];
        const lengths = [3, 5, 2, 4];
        const displacements = solveDisplacement(positions, lengths);

        expectNoOverlap(positions, lengths, displacements);
        expect(
            displacements.reduce((sum, value) => sum + value, 0)
        ).toBeCloseTo(0);
    });

    test("preserves stable order for coincident positions", () => {
        const positions = [5, 5, 5];
        const lengths = [2, 4, 2];
        const displacements = solveDisplacement(positions, lengths);
        const adjusted = positions.map(
            (position, index) => position + displacements[index]
        );

        expect(adjusted).toEqual([2, 5, 8]);
        expectNoOverlap(positions, lengths, displacements);
    });

    test("optionally reuses the output array", () => {
        const output = [NaN, NaN, NaN];

        expect(solveDisplacement([0, 0], [2, 2], output)).toBe(output);
        expect(output).toEqual([-1, 1]);
    });

    test.each([
        [[], [], []],
        [[3], [2], [0]],
    ])("handles trivial input %#", (positions, lengths, expected) => {
        expect(solveDisplacement(positions, lengths)).toEqual(expected);
    });

    test.each([
        [[NaN], [1], "positions"],
        [[0], [Infinity], "lengths"],
        [[0], [-1], "lengths"],
        [[1, 0], [1, 1], "ordered"],
        [[0, 1], [1], "same number"],
    ])("rejects invalid input %#", (positions, lengths, message) => {
        expect(() => solveDisplacement(positions, lengths)).toThrow(message);
    });
});
