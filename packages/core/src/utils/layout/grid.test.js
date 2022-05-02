import { expect, test, describe } from "vitest";

import Grid from "./grid";

describe("Grid indexing", () => {
    test("Single row", () => {
        const g = new Grid(3);

        expect(g.maxCols).toEqual(Infinity);
        expect(g.nCols).toEqual(3);
        expect(g.nRows).toEqual(1);
        expect(g.colIndices).toEqual([[0], [1], [2]]);
        expect(g.rowIndices).toEqual([[0, 1, 2]]);
        expect(g.getCellIndex(1, 0)).toEqual(1);
        expect(g.getCellIndex(1, 1)).toBeUndefined();
        expect(g.getCellCoords(1)).toEqual([1, 0]);
        expect(g.getCellCoords(-1)).toBeUndefined();
        expect(g.getCellCoords(3)).toBeUndefined();
    });

    test("Single column", () => {
        const g = new Grid(3, 1);

        expect(g.maxCols).toEqual(1);
        expect(g.nCols).toEqual(1);
        expect(g.nRows).toEqual(3);
        expect(g.colIndices).toEqual([[0, 1, 2]]);
        expect(g.rowIndices).toEqual([[0], [1], [2]]);
        expect(g.getCellIndex(0, 1)).toEqual(1);
        expect(g.getCellIndex(1, 1)).toBeUndefined();
        expect(g.getCellCoords(1)).toEqual([0, 1]);
    });

    test("Two columns", () => {
        const g = new Grid(6, 2);

        expect(g.maxCols).toEqual(2);
        expect(g.nCols).toEqual(2);
        expect(g.nRows).toEqual(3);
        expect(g.colIndices).toEqual([
            [0, 2, 4],
            [1, 3, 5],
        ]);
        expect(g.rowIndices).toEqual([
            [0, 1],
            [2, 3],
            [4, 5],
        ]);
        expect(g.getCellIndex(1, 0)).toEqual(1);
        expect(g.getCellIndex(0, 1)).toEqual(2);
        expect(g.getCellIndex(1, 1)).toEqual(3);
        expect(g.getCellCoords(3)).toEqual([1, 1]);
    });

    test("Two columns, second is partial", () => {
        const g = new Grid(5, 2);

        expect(g.maxCols).toEqual(2);
        expect(g.nCols).toEqual(2);
        expect(g.nRows).toEqual(3);
        expect(g.colIndices).toEqual([
            [0, 2, 4],
            [1, 3],
        ]);
        expect(g.rowIndices).toEqual([[0, 1], [2, 3], [4]]);
        expect(g.getCellIndex(1, 0)).toEqual(1);
        expect(g.getCellIndex(0, 1)).toEqual(2);
        expect(g.getCellIndex(1, 2)).toBeUndefined();
        expect(g.getCellCoords(3)).toEqual([1, 1]);
    });
});
