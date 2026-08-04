import { describe, expect, test } from "vitest";
import {
    createDisplace1DWorkspace,
    solveDisplacement,
} from "./displace1dSolver.js";

/**
 * @param {{ position: number, length: number }[]} items
 * @param {number[]} [output]
 * @param {import("./displace1dSolver.js").Displace1DWorkspace} [workspace]
 */
function solve(items, output = [], workspace = createDisplace1DWorkspace()) {
    return solveDisplacement(
        items,
        (item) => item.position,
        (item) => item.length,
        output,
        workspace
    );
}

/**
 * @param {{ position: number, length: number }[]} items
 * @param {number[]} displacements
 */
function expectNoOverlap(items, displacements) {
    for (let i = 1; i < items.length; i++) {
        const previous = items[i - 1];
        const current = items[i];
        const separation =
            current.position +
            displacements[i] -
            (previous.position + displacements[i - 1]);
        expect(separation).toBeGreaterThanOrEqual(
            (previous.length + current.length) / 2
        );
    }
}

describe("solveDisplacement", () => {
    test("keeps already separated items in place", () => {
        const items = [
            { position: 0, length: 2 },
            { position: 3, length: 2 },
            { position: 8, length: 4 },
        ];

        expect(solve(items)).toEqual([0, 0, 0]);
    });

    test("resolves a two-item collision symmetrically", () => {
        const items = [
            { position: 0, length: 2 },
            { position: 0, length: 2 },
        ];

        expect(solve(items)).toEqual([-1, 1]);
    });

    test("finds the least-squares placement for a cluster", () => {
        const items = [
            { position: 0, length: 2 },
            { position: 1, length: 2 },
            { position: 2, length: 2 },
        ];

        expect(solve(items)).toEqual([-1, 0, 1]);
    });

    test("supports variable collision lengths and caller-provided padding", () => {
        const items = [
            { position: 0, length: 3 },
            { position: 1, length: 5 },
            { position: 3, length: 2 },
            { position: 8, length: 4 },
        ];
        const displacements = solve(items);

        expectNoOverlap(items, displacements);
        expect(
            displacements.reduce((sum, value) => sum + value, 0)
        ).toBeCloseTo(0);
    });

    test("preserves stable order for coincident positions", () => {
        const items = [
            { position: 5, length: 2 },
            { position: 5, length: 4 },
            { position: 5, length: 2 },
        ];
        const displacements = solve(items);
        const adjusted = items.map(
            (item, index) => item.position + displacements[index]
        );

        expect(adjusted).toEqual([2, 5, 8]);
        expectNoOverlap(items, displacements);
    });

    test("reuses output and workspace arrays", () => {
        const workspace = createDisplace1DWorkspace();
        /** @type {number[]} */
        const output = [];
        const firstItems = [
            { position: 0, length: 2 },
            { position: 0, length: 2 },
        ];
        const secondItems = [
            { position: 0, length: 2 },
            { position: 5, length: 2 },
            { position: 10, length: 2 },
        ];

        expect(solve(firstItems, output, workspace)).toBe(output);
        expect(output).toEqual([-1, 1]);
        expect(solve(secondItems, output, workspace)).toBe(output);
        expect(output).toEqual([0, 0, 0]);
    });

    test.each([[[]], [[{ position: 3, length: 2 }]]])(
        "handles trivial input %#",
        (items) => {
            expect(solve(items)).toEqual(items.length ? [0] : []);
        }
    );

    test.each([
        [[{ position: NaN, length: 1 }], "positions"],
        [[{ position: 0, length: Infinity }], "lengths"],
        [[{ position: 0, length: -1 }], "lengths"],
        [
            [
                { position: 1, length: 1 },
                { position: 0, length: 1 },
            ],
            "ordered",
        ],
    ])("rejects invalid input %#", (items, message) => {
        expect(() => solve(items)).toThrow(message);
    });
});
