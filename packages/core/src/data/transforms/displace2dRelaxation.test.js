import { describe, expect, test } from "vitest";
import { Displace2DRelaxation } from "./displace2dRelaxation.js";

/**
 * @param {number} priority
 * @param {number} [x]
 * @param {number} [y]
 * @returns {import("./displace2dRelaxation.js").RelaxationItem}
 */
function item(priority, x = 0, y = 0) {
    return {
        datum: { priority },
        anchorX: 0,
        anchorY: 0,
        x,
        y,
        vx: 0,
        vy: 0,
        width: 10,
        height: 10,
        anchorWidth: 0,
        anchorHeight: 0,
        priority,
    };
}

describe("Displace2DRelaxation", () => {
    test("separates coincident rectangles with bounded deterministic steps", () => {
        const first = item(0);
        const second = item(1);
        const relaxation = new Displace2DRelaxation([first, second]);

        relaxation.step();
        expect(
            Math.max(Math.abs(first.y), Math.abs(second.y))
        ).toBeLessThanOrEqual(4);
        expect(first.y).not.toBe(second.y);

        for (let i = 0; i < 40; i++) {
            relaxation.step();
        }
        expect(Math.abs(first.y - second.y)).toBeGreaterThan(9.5);
    });

    test("pulls a separated rectangle smoothly toward its anchor", () => {
        const label = item(0, 50, 0);
        const relaxation = new Displace2DRelaxation([label]);

        relaxation.step();
        expect(label.x).toBeLessThan(50);
        expect(label.x).toBeGreaterThanOrEqual(47);
    });

    test("repels labels from fixed anchor obstacles", () => {
        const label = item(0);
        label.anchorWidth = 6;
        label.anchorHeight = 6;
        const relaxation = new Displace2DRelaxation([label]);

        for (let i = 0; i < 20; i++) {
            relaxation.step();
        }

        expect(Math.abs(label.y)).toBeGreaterThan(7);
    });

    test("gives later labels greater mobility", () => {
        const first = item(0);
        const second = item(1);
        const relaxation = new Displace2DRelaxation([first, second]);

        relaxation.step();

        expect(Math.abs(second.y)).toBeGreaterThan(Math.abs(first.y));
    });
});
