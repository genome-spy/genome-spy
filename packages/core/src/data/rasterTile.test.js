import { expect, test } from "vitest";
import { readRasterTile } from "./rasterTile.js";

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
