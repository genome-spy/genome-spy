import { expect, test } from "vitest";
import { getRasterCellRange, readRasterTile } from "./rasterTile.js";

test.each([
    { origin: -1, step: 1 },
    { origin: 0.5, step: 1 },
    { origin: 0, step: 0.5 },
    { origin: 2 ** 44 - 1, step: 1 },
])("locus tiles reject unsupported row endpoints (%j)", (row) => {
    const datum = {
        dimensions: {
            column: { origin: 0, step: 1, count: 1 },
            row: { ...row, count: 1 },
        },
        fields: { value: [1] },
    };
    expect(() =>
        readRasterTile(datum, "column", "row", "value", {
            direct: false,
            grid: "locus",
        })
    ).toThrow(/dimension "row" needs nonnegative whole-base endpoints/);
});

// Division alone rounds the right edge in this grid past index two.
test("brush ranges honor exact fractional cell edges", () => {
    const grid = { origin: 0.1, step: 0.1, count: 4 };
    const bounds = [0.1 + 0.1, 0.1 + 2 * 0.1];
    expect(getRasterCellRange(grid, bounds, "intersects")).toEqual([1, 2]);
    expect(getRasterCellRange(grid, bounds, "encloses")).toEqual([1, 2]);
    expect(getRasterCellRange(grid, bounds, "endpoints")).toEqual([0, 2]);
    expect(getRasterCellRange(grid, bounds, "start")).toEqual([1, 2]);
    expect(getRasterCellRange(grid, bounds, "end")).toEqual([0, 1]);
    expect(
        getRasterCellRange(grid, [bounds[0], bounds[0]], "intersects")
    ).toEqual([0, 0]);
});
