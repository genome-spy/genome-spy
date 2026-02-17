// @ts-check
import { describe, it, expect } from "vitest";
import { rowsToColumns, columnsToRows } from "./dataLayout.js";

describe("rowsToColumns", () => {
    it("converts array of objects to object of arrays", () => {
        const rows = [
            { a: 1, b: "x" },
            { a: 2, b: "y" },
            { a: 3, b: "z" },
        ];
        const result = rowsToColumns(rows);
        expect(result).toEqual({
            a: [1, 2, 3],
            b: ["x", "y", "z"],
        });
    });

    it("handles single row", () => {
        const rows = [{ x: 10, y: 20 }];
        const result = rowsToColumns(rows);
        expect(result).toEqual({
            x: [10],
            y: [20],
        });
    });

    it("handles empty array", () => {
        const result = rowsToColumns([]);
        expect(result).toEqual({});
    });

    it("preserves order of keys from first row", () => {
        const rows = [
            { z: 1, a: 2, m: 3 },
            { z: 4, a: 5, m: 6 },
        ];
        const result = rowsToColumns(rows);
        const keys = Object.keys(result);
        expect(keys).toEqual(["z", "a", "m"]);
    });

    it("handles mixed types", () => {
        const rows = [
            { id: 1, name: "Alice", active: true, score: 9.5 },
            { id: 2, name: "Bob", active: false, score: null },
        ];
        const result = rowsToColumns(rows);
        expect(result).toEqual({
            id: [1, 2],
            name: ["Alice", "Bob"],
            active: [true, false],
            score: [9.5, null],
        });
    });
});

describe("columnsToRows", () => {
    it("converts object of arrays to array of objects", () => {
        const columns = {
            a: [1, 2, 3],
            b: ["x", "y", "z"],
        };
        const result = columnsToRows(columns);
        expect(result).toEqual([
            { a: 1, b: "x" },
            { a: 2, b: "y" },
            { a: 3, b: "z" },
        ]);
    });

    it("handles single column", () => {
        const columns = { value: [10, 20, 30] };
        const result = columnsToRows(columns);
        expect(result).toEqual([{ value: 10 }, { value: 20 }, { value: 30 }]);
    });

    it("handles single row (arrays of length 1)", () => {
        const columns = { x: [5], y: ["hello"] };
        const result = columnsToRows(columns);
        expect(result).toEqual([{ x: 5, y: "hello" }]);
    });

    it("handles empty object (no columns)", () => {
        const result = columnsToRows({});
        expect(result).toEqual([]);
    });

    it("throws on mismatched array lengths", () => {
        const columns = {
            a: [1, 2, 3],
            b: ["x", "y"],
        };
        expect(() => columnsToRows(columns)).toThrow(/identical lengths/);
    });

    it("throws on non-array column value", () => {
        const columns = {
            a: [1, 2],
            b: "not-an-array",
        };
        expect(() => columnsToRows(/** @type {any} */ (columns))).toThrow(
            /not an array/
        );
    });

    it("preserves order of keys", () => {
        const columns = { z: [1, 2], a: [3, 4], m: [5, 6] };
        const result = columnsToRows(columns);
        const keys = Object.keys(result[0]);
        expect(keys).toEqual(["z", "a", "m"]);
    });

    it("handles mixed types", () => {
        const columns = {
            id: [1, 2],
            name: ["Alice", "Bob"],
            active: [true, false],
            score: [9.5, null],
        };
        const result = columnsToRows(columns);
        expect(result).toEqual([
            { id: 1, name: "Alice", active: true, score: 9.5 },
            { id: 2, name: "Bob", active: false, score: null },
        ]);
    });
});

describe("roundtrip conversions", () => {
    it("rowsToColumns then columnsToRows recovers original", () => {
        const original = [
            { a: 1, b: "x", c: true },
            { a: 2, b: "y", c: false },
            { a: 3, b: "z", c: true },
        ];
        const columns = rowsToColumns(original);
        const recovered = columnsToRows(columns);
        expect(recovered).toEqual(original);
    });

    it("columnsToRows then rowsToColumns recovers original", () => {
        const original = {
            a: [1, 2, 3],
            b: ["x", "y", "z"],
            c: [true, false, true],
        };
        const rows = columnsToRows(original);
        const recovered = rowsToColumns(rows);
        expect(recovered).toEqual(original);
    });
});
