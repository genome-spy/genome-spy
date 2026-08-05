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

        expect(solveDisplacement([0, 0], [2, 2], undefined, output)).toBe(
            output
        );
        expect(output).toEqual([-1, 1]);
    });

    test("keeps collision intervals inside a feasible extent", () => {
        const positions = [80, 90];
        const lengths = [20, 20];
        const displacements = solveDisplacement(positions, lengths, [0, 100]);

        expect(displacements).toEqual([-10, 0]);
        expectNoOverlap(positions, lengths, displacements);
        expect(positions[0] + displacements[0] - lengths[0] / 2).toBe(60);
        expect(positions[1] + displacements[1] + lengths[1] / 2).toBe(100);
    });

    test("constrains separated edge items without moving interior items", () => {
        const positions = [-10, 5, 20];
        const lengths = [2, 2, 2];
        const displacements = solveDisplacement(positions, lengths, [0, 10]);

        expect(displacements).toEqual([11, 0, -11]);
        expectNoOverlap(positions, lengths, displacements);
    });

    test("uses the minimum-overflow placement when the extent is infeasible", () => {
        const positions = [8, 9];
        const lengths = [6, 6];
        const displacements = solveDisplacement(positions, lengths, [0, 10]);

        expect(displacements).toEqual([-5, 0]);
        expectNoOverlap(positions, lengths, displacements);
        expect(positions[0] + displacements[0] - lengths[0] / 2).toBe(0);
        expect(positions[1] + displacements[1] + lengths[1] / 2).toBe(12);
    });

    test("is continuous at extent feasibility and collision transitions", () => {
        const solveAtFactor = (/** @type {number} */ factor) =>
            solveDisplacement(
                [0, 0.1].map((position) => position * factor),
                [20, 20],
                [-0.1 * factor, 0.2 * factor]
            );
        const epsilon = 1e-6;

        for (const transition of [400 / 3, 200]) {
            const before = solveAtFactor(transition - epsilon);
            const after = solveAtFactor(transition + epsilon);
            expect(Math.abs(before[0] - after[0])).toBeLessThan(1e-5);
            expect(Math.abs(before[1] - after[1])).toBeLessThan(1e-5);
        }
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

    test.each([
        [NaN, 1],
        [0, Infinity],
        [1, 0],
    ])("rejects invalid extent %#", (start, end) => {
        expect(() => solveDisplacement([0], [1], [start, end])).toThrow(
            "finite ascending bounds"
        );
    });
});
