import { describe, expect, it } from "vitest";
import {
    chunkInitialLoadColumns,
    getEffectiveInitialLoad,
    resolveInitialLoadColumnIds,
} from "./metadataSourceInitialLoad.js";

describe("getEffectiveInitialLoad", () => {
    it("defaults data backends to eager wildcard loading", () => {
        const source = {
            backend: {
                backend: "data",
                data: { values: [{ sample: "s1", a: 1 }] },
            },
        };

        expect(getEffectiveInitialLoad(source)).toBe("*");
    });

    it("defaults non-data backends to disabled initial loading", () => {
        const source = {
            backend: {
                backend: "zarr",
                url: "https://example.org/expr.zarr",
                layout: "matrix",
            },
        };

        expect(getEffectiveInitialLoad(source)).toBe(false);
    });
});

describe("resolveInitialLoadColumnIds", () => {
    it("resolves wildcard from listed columns in adapter order", async () => {
        const source = {
            initialLoad: "*",
            backend: {
                backend: "data",
                data: { values: [{ sample: "s1", a: 1 }] },
            },
        };

        const adapter = {
            listColumns: async () => [{ id: "B" }, { id: "A" }],
            resolveColumns: async () => ({ columnIds: [] }),
        };

        await expect(
            resolveInitialLoadColumnIds(source, adapter)
        ).resolves.toEqual(["B", "A"]);
    });

    it("resolves explicit lists through adapter lookup", async () => {
        const source = {
            initialLoad: ["A", "MISSING"],
            backend: {
                backend: "zarr",
                url: "https://example.org/expr.zarr",
                layout: "matrix",
            },
        };

        const adapter = {
            listColumns: async () => [],
            resolveColumns: async (queries) => ({
                columnIds: queries.filter((query) => query === "A"),
            }),
        };

        await expect(
            resolveInitialLoadColumnIds(source, adapter)
        ).resolves.toEqual(["A"]);
    });
});

describe("chunkInitialLoadColumns", () => {
    it("splits columns to hard-limit-sized chunks", () => {
        const columnIds = Array.from({ length: 205 }, (_, i) => "c" + i);
        const chunks = chunkInitialLoadColumns(columnIds);

        expect(chunks.map((chunk) => chunk.length)).toEqual([100, 100, 5]);
        expect(chunks[0][0]).toBe("c0");
        expect(chunks[2][4]).toBe("c204");
    });
});
