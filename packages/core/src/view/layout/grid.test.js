import { expect, test } from "vitest";
import Grid from "./grid.js";

// The same indexing contract covers wrapped layouts and the surround's sparse cross.
test.each([
    {
        cells: 3,
        columns: undefined,
        rows: [[0, 1, 2]],
        cols: [[0], [1], [2]],
    },
    { cells: 3, columns: 1, rows: [[0], [1], [2]], cols: [[0, 1, 2]] },
    {
        cells: 5,
        columns: 2,
        rows: [[0, 1], [2, 3], [4]],
        cols: [
            [0, 2, 4],
            [1, 3],
        ],
    },
    {
        cells: /** @type {[number, number][]} */ ([
            [1, 1],
            [1, 0],
            [2, 1],
            [1, 2],
            [0, 1],
        ]),
        columns: undefined,
        rows: [[1], [0, 2, 4], [3]],
        cols: [[4], [0, 1, 3], [2]],
    },
    { cells: 0, columns: undefined, rows: [[]], cols: [] },
    {
        cells: /** @type {[number, number][]} */ ([]),
        columns: undefined,
        rows: [],
        cols: [],
    },
])("indexes $cells with $columns columns", ({ cells, columns, rows, cols }) => {
    const grid = new Grid(cells, columns);
    expect(grid.maxCols).toBe(columns ?? Infinity);
    expect(grid.nRows).toBe(rows.length);
    expect(grid.nCols).toBe(cols.length);
    expect(grid.rowIndices).toEqual(rows);
    expect(grid.colIndices).toEqual(cols);
    for (let row = 0; row <= rows.length; row++) {
        for (let col = 0; col <= cols.length; col++) {
            const expected = rows[row]?.find((index) =>
                cols[col]?.includes(index)
            );
            expect(grid.getCellIndex(col, row)).toBe(expected);
            if (expected !== undefined) {
                expect(grid.getCellCoords(expected)).toEqual([col, row]);
            }
        }
    }
    expect(grid.getCellCoords(-1)).toBeUndefined();
    expect(grid.getCellCoords(grid.n)).toBeUndefined();
});
