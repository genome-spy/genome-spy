import { describe, expect, test } from "vitest";
import { Displace2DConstraintSolver } from "./displace2dConstraintSolver.js";

/**
 * @param {number} priority
 * @param {number} [x]
 * @param {number} [y]
 * @returns {import("./displace2dConstraintSolver.js").ConstraintItem}
 */
function item(priority, x = 0, y = 0) {
    return {
        datum: { priority },
        anchorX: 0,
        anchorY: 0,
        x,
        y,
        width: 10,
        height: 10,
        anchorWidth: 0,
        anchorHeight: 0,
        priority,
    };
}

describe("Displace2DConstraintSolver", () => {
    test("separates coincident rectangles with bounded deterministic steps", () => {
        const first = item(0);
        const second = item(1);
        const solver = new Displace2DConstraintSolver([first, second]);

        solver.step();
        expect(
            Math.max(
                Math.abs(first.x),
                Math.abs(first.y),
                Math.abs(second.x),
                Math.abs(second.y)
            )
        ).toBeLessThanOrEqual(1.5);
        expect([first.x, first.y]).not.toEqual([second.x, second.y]);

        solver.solve();
        expect(
            Math.max(Math.abs(first.x - second.x), Math.abs(first.y - second.y))
        ).toBeGreaterThan(11.99);
    });

    test("pulls a separated rectangle toward its anchor without overshoot", () => {
        const label = item(0, 50, 0);
        const solver = new Displace2DConstraintSolver([label]);

        let previous = label.x;
        for (let i = 0; i < 10; i++) {
            solver.step();
            expect(label.x).toBeLessThan(previous);
            expect(label.x).toBeGreaterThanOrEqual(0);
            previous = label.x;
        }
    });

    test("projects labels out of fixed anchor obstacles", () => {
        const label = item(0);
        label.anchorWidth = 6;
        label.anchorHeight = 6;
        const solver = new Displace2DConstraintSolver([label]);

        solver.solve();

        expect(Math.max(Math.abs(label.x), Math.abs(label.y))).toBeGreaterThan(
            9.9
        );
    });

    test("gives later labels greater mobility", () => {
        const first = item(0);
        const second = item(1);
        const solver = new Displace2DConstraintSolver([first, second]);

        for (let i = 0; i < 5; i++) {
            solver.step();
        }

        expect(Math.hypot(second.x, second.y)).toBeGreaterThan(
            Math.hypot(first.x, first.y)
        );
    });

    test("keeps feasible placements inside extents", () => {
        const label = item(0, -20, 50);
        label.anchorX = -20;
        label.anchorY = 50;
        const solver = new Displace2DConstraintSolver(
            [label],
            [0, 100],
            [0, 100]
        );

        solver.solve();

        expect(label.x).toBeGreaterThanOrEqual(5);
        expect(label.y).toBe(50);
    });

    test("radically compacts a retained label to the nearest free sample", () => {
        const fixed = item(0);
        const displaced = item(1, 100, 0);
        const solver = new Displace2DConstraintSolver([fixed, displaced]);

        expect(solver.compactTowardAnchors()).toBe(true);

        expect(displaced.x).toBeGreaterThanOrEqual(12);
        expect(displaced.x).toBeLessThan(20);
        expect(displaced.y).toBe(0);
    });

    test("eliminates overlaps in a feasible clustered layout", () => {
        const anchors = [
            [0, 0],
            [3, 2],
            [-2, 4],
            [5, -3],
            [-5, -4],
            [1, 7],
        ];
        const items = anchors.map(([anchorX, anchorY], priority) => ({
            ...item(priority, anchorX, anchorY),
            anchorX,
            anchorY,
            width: 24,
            height: 12,
        }));
        const solver = new Displace2DConstraintSolver(items);

        solver.solve();

        for (let i = 0; i < items.length; i++) {
            for (let j = 0; j < i; j++) {
                expect(
                    Math.abs(items[i].x - items[j].x) >= 25.9 ||
                        Math.abs(items[i].y - items[j].y) >= 13.9
                ).toBe(true);
            }
        }
    });

    test("resolves heterogeneous labels around clustered anchor obstacles", () => {
        const source = [
            [4.82, 5.08, 38],
            [4.96, 5.12, 38],
            [5.08, 4.98, 54],
            [4.91, 4.89, 62],
            [5.18, 5.09, 30],
            [5.02, 5.24, 38],
            [4.74, 4.95, 38],
            [5.23, 4.86, 62],
            [4.85, 5.28, 46],
            [5.3, 5.2, 38],
            [5.12, 5.31, 30],
            [4.69, 5.18, 30],
        ];
        const items = source.map(([sourceX, sourceY, width], priority) => {
            const anchorX = (1 - (sourceX - 3.5) / 3) * 760;
            const anchorY = ((sourceY - 3.5) / 3) * 500;
            return {
                ...item(priority, anchorX, anchorY),
                anchorX,
                anchorY,
                width,
                height: 16,
                anchorWidth: 12,
                anchorHeight: 12,
            };
        });
        const solver = new Displace2DConstraintSolver(
            items,
            [0, 760],
            [0, 500]
        );

        solver.solve();

        for (let i = 0; i < items.length; i++) {
            for (let j = 0; j < i; j++) {
                expect(
                    Math.abs(items[i].x - items[j].x) * 2 >=
                        items[i].width + items[j].width ||
                        Math.abs(items[i].y - items[j].y) >= 16
                ).toBe(true);
            }
        }
    });
});
