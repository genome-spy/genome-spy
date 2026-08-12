import { describe, expect, test } from "vitest";
import { removeOverlappingAxisLabels } from "./axisLabelOverlap.js";

/** @typedef {{ id: string, bounds: [number, number] }} Candidate */

/** @param {Candidate} candidate */
const bounds = (candidate) => candidate.bounds;

/**
 * @param {string} id
 * @param {number} start
 * @param {number} end
 * @returns {Candidate}
 */
const candidate = (id, start, end) => ({
    id,
    bounds: /** @type {[number, number]} */ ([start, end]),
});

/** @param {Candidate[]} candidates */
const ids = (candidates) => candidates.map((candidate) => candidate.id);

describe("removeOverlappingAxisLabels", () => {
    test("retains all labels when their variable-width bounds do not overlap", () => {
        const candidates = [
            candidate("a", -5, 5),
            candidate("b", 10, 30),
            candidate("c", 35, 40),
        ];

        expect(
            removeOverlappingAxisLabels(candidates, bounds, "parity", 0)
        ).toBe(candidates);
    });

    test("parity repeatedly removes alternating labels", () => {
        const candidates = [
            candidate("a", -6, 6),
            candidate("b", 4, 16),
            candidate("c", 14, 26),
            candidate("d", 24, 36),
            candidate("e", 34, 46),
        ];

        expect(
            ids(removeOverlappingAxisLabels(candidates, bounds, "parity", 0))
        ).toEqual(["a", "c", "e"]);
    });

    test("greedy accounts for variable label widths and separation", () => {
        const candidates = [
            candidate("a", 0, 8),
            candidate("wide", 10, 35),
            candidate("c", 20, 28),
            candidate("d", 40, 48),
        ];

        expect(
            ids(removeOverlappingAxisLabels(candidates, bounds, "greedy", 3))
        ).toEqual(["a", "c", "d"]);
    });

    test("preserves the first and last labels when only two can remain", () => {
        const candidates = [
            candidate("a", 0, 20),
            candidate("b", 10, 30),
            candidate("c", 20, 40),
            candidate("d", 30, 50),
        ];

        expect(
            ids(removeOverlappingAxisLabels(candidates, bounds, "greedy", 0))
        ).toEqual(["a", "d"]);
    });

    test("works with bounds ordered in the reverse axis direction", () => {
        const candidates = [
            candidate("a", 44, 56),
            candidate("b", 34, 46),
            candidate("c", 24, 36),
            candidate("d", 14, 26),
            candidate("e", 4, 16),
        ];

        expect(
            ids(removeOverlappingAxisLabels(candidates, bounds, "parity", 0))
        ).toEqual(["a", "c", "e"]);
    });
});
