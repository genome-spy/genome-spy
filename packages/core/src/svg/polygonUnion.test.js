import { describe, expect, test } from "vitest";
import { unionPolygons } from "./polygonUnion.js";

describe("SVG polygon union", () => {
    test("removes boundaries inside overlapping polygons", () => {
        const loops = unionPolygons([
            [
                { x: 0, y: 0 },
                { x: 6, y: 0 },
                { x: 6, y: 4 },
                { x: 0, y: 4 },
            ],
            [
                { x: 4, y: 1 },
                { x: 8, y: 1 },
                { x: 8, y: 3 },
                { x: 4, y: 3 },
            ],
        ]);

        expect(loops).toHaveLength(1);
        expect(loops[0]).toHaveLength(8);
    });

    test("keeps disconnected polygons as separate loops", () => {
        const loops = unionPolygons([
            [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 0, y: 1 },
            ],
            [
                { x: 3, y: 0 },
                { x: 4, y: 0 },
                { x: 3, y: 1 },
            ],
        ]);

        expect(loops).toHaveLength(2);
    });
});
