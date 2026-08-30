import { InternMap } from "internmap";
import { describe, expect, test, vi } from "vitest";
import Rectangle from "../../view/layout/rectangle.js";
import { getMarkData, SampleFacetCoordsResolver } from "./markData.js";

/**
 * @param {Map<any, object[]> | InternMap<any, object[]>} facetBatches
 */
function createMark(facetBatches) {
    return /** @type {import("../../marks/mark.js").default} */ (
        /** @type {unknown} */ ({
            unitView: {
                getCollector: () => ({ facetBatches }),
                getPathString: () => "root/mark",
            },
        })
    );
}

describe("CPU mark data", () => {
    test("materializes sample coordinates once for consecutive marks", () => {
        const x = vi.fn(() => 10);
        const y = vi.fn(() => 20);
        const width = vi.fn(() => 200);
        const height = vi.fn(() => 100);
        const coords = new Rectangle(x, y, width, height);
        const facet = {
            locSize: { location: 25, size: 10 },
            pixelToUnit: 0.01,
        };
        const resolver = new SampleFacetCoordsResolver();

        const first = resolver.resolveFacet(coords, facet);
        expect([first.x, first.y, first.width, first.height]).toEqual([
            10, 45, 200, 10,
        ]);
        expect(resolver.resolveFacet(coords, facet)).toBe(first);
        facet.locSize.location = 30;
        facet.locSize.size = 20;
        expect(resolver.resolveFacet(coords, facet)).toBe(first);
        expect([first.x, first.y, first.width, first.height]).toEqual([
            10, 50, 200, 20,
        ]);
        expect(
            resolver.resolveFacet(coords, {
                locSize: { location: 50, size: 20 },
                pixelToUnit: 0.01,
            })
        ).toBe(first);
        expect([first.x, first.y, first.width, first.height]).toEqual([
            10, 70, 200, 20,
        ]);
        expect(x).toHaveBeenCalledOnce();
        expect(y).toHaveBeenCalledOnce();
        expect(width).toHaveBeenCalledOnce();
        expect(height).toHaveBeenCalledOnce();
    });

    test("reuses coordinates across explicit and placement facets", () => {
        const coords = Rectangle.create(10, 20, 200, 100);
        const resolver = new SampleFacetCoordsResolver();
        const facet = {
            locSize: { location: 25, size: 10 },
            pixelToUnit: 0.01,
        };
        const occurrenceCoords = resolver.resolveFacet(coords, facet);
        const placementSource = {
            getSnapshot: () => ({
                rectangles: new Float32Array([
                    0, 0.5, 1, 0.25, 0, 0.75, 1, 0.1,
                ]),
            }),
        };

        const placed = resolver.resolvePlacement(
            coords,
            /** @type {any} */ (placementSource),
            1
        );
        expect(placed).toBe(occurrenceCoords);
        expect(placed && [placed.x, placed.y, placed.width]).toEqual([
            10, 95, 200,
        ]);
        expect(placed?.height).toBeCloseTo(10);

        const explicit = resolver.resolveFacet(coords, facet);
        expect(explicit).toBe(occurrenceCoords);
        expect([
            explicit.x,
            explicit.y,
            explicit.width,
            explicit.height,
        ]).toEqual([10, 45, 200, 10]);
    });

    test("repeats non-faceted data for a sample facet", () => {
        const data = [{ value: 1 }];
        const mark = createMark(new Map([[undefined, data]]));

        expect(getMarkData(mark, { facetId: ["sample-1"] })).toBe(data);
    });

    test("uses sample-faceted data when the non-faceted batch is empty", () => {
        const data = [{ value: 2 }];
        const mark = createMark(
            new InternMap(
                [
                    [undefined, []],
                    [["sample-1"], data],
                ],
                JSON.stringify
            )
        );

        expect(getMarkData(mark, { facetId: ["sample-1"] })).toBe(data);
    });

    test("treats a missing sample facet as empty", () => {
        const mark = createMark(
            new InternMap(
                [
                    [undefined, []],
                    [["sample-1"], [{ value: 1 }]],
                ],
                JSON.stringify
            )
        );

        expect(getMarkData(mark, { facetId: ["sample-without-data"] })).toEqual(
            []
        );
    });
});
