import { describe, expect, it } from "vitest";
import { createDashIntervals } from "./dashIntervals.js";

describe("rule dash intervals", () => {
    /** @param {number[]} pattern @param {number} x @param {number} [row] */
    const sample = (pattern, x, row = 0) => {
        const { data, length } = createDashIntervals(pattern);
        const offset = (row * length + x) * 4;
        return Array.from(data.subarray(offset, offset + 4));
    };

    // The shader needs the previous dash even when the next clips at a finite endpoint.
    it("retains both neighbors at dash boundaries and wraps the period", () => {
        expect(sample([3, 1, 1, 2], 4)).toEqual([-4, -1, 0, 1]);
        expect(sample([3, 1, 1, 2], 0)).toEqual([-3, -2, 0, 3]);
    });

    it("keeps point dashes for caps without hiding positive butt dashes", () => {
        expect(sample([2, 3, 0, 4], 5)).toEqual([0, 0, 4, 6]);
        expect(sample([2, 3, 0, 4], 5, 1)).toEqual([-5, -3, 4, 6]);
        expect(sample([0, 28], 0)).toEqual([0, 0, 28, 28]);
        expect(sample([0, 28], 0, 1)).toEqual([1, -1, 1, -1]);
    });

    it("merges touching runs within and across periods", () => {
        expect(sample([2, 0, 2, 3], 2)).toEqual([-2, 2, -2, 2]);
        expect(sample([2, 3, 2, 0], 0)).toEqual([-2, 2, -2, 2]);
        expect(createDashIntervals([3, 0]).length).toBe(0);
        expect(createDashIntervals(undefined).length).toBe(0);
    });

    it("rejects unsupported patterns at the resource boundary", () => {
        for (const pattern of [[], [1], [0, 0], [-1, 2], [1.5, 2], [1001, 2]])
            expect(() => createDashIntervals(pattern)).toThrow(
                "Invalid stroke dash pattern"
            );
    });
});
